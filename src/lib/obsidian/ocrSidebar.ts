import { IndicatorSidebar } from "./sidebar";
import { getAttachments, type CyberPlugin, type ParsedIndicators, type OcrProvider, type OcrTask, processExclusions } from "obsidian-cyber-utils";
import { TFile, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
import Sidebar from "../components/Sidebar.svelte";
import OcrIocList from "../components/OcrIocList.svelte";

export const OCR_VIEW_TYPE = "ocr-indicator-sidebar";

export enum ProcessingMode {
    SEQUENTIAL = "sequential",
    PARALLEL = "parallel"
}

export interface OcrSidebarConfig {
    processingMode: ProcessingMode,
    maxConcurrent: number
}

export interface ProgressStats {
    completedTasks: number;
    totalTasks: number;
    percentage: number;
}

export class OcrSidebar extends IndicatorSidebar {
    attachments: string[];
    pendingAttachments: Set<string> = new Set();
    ocrProvider: OcrProvider | null;
    ocrIocs: ParsedIndicators[] | null;
    ocrCache: Map<string, ParsedIndicators[]>;
    processingTasks: Map<string, string>;
    progressPercentage: number = 0;
    isBusy: boolean = false;
    ocrComponent: OcrIocList | undefined;
    progressStats: ProgressStats = {
        completedTasks: 0,
        totalTasks: 0,
        percentage: 0
    }

    viewType: string = OCR_VIEW_TYPE;
    
    // Event handler references for cleanup
    private eventHandlers: Map<string, (...args: any[]) => void> = new Map();

    constructor(
        leaf: WorkspaceLeaf,
        plugin: CyberPlugin,
        ocrProvider: OcrProvider | null
    ) {
        super(leaf, plugin);
        this.attachments = [];
        this.ocrIocs = null;
        this.ocrProvider = null;
        this.ocrCache = new Map<string, ParsedIndicators[]>();
        this.processingTasks = new Map<string, string>();

        // Set up OCR provider if provided
        if (ocrProvider) {
            this.updateOcrProvider(ocrProvider);
        }
    }

    getDisplayText(): string {
        return "OCR Indicator Sidebar";
    }

    registerOpenFile() {
        this.registerEvent(
            this.app.workspace.on('file-open', async (file: TFile | null) => {
                if (file && file === this.app.workspace.getActiveFile() && file != this.currentFile) {
                    // Cancel operations and reset state
                    this.cancelAndResetState();

                    this.currentFile = this.app.workspace.getActiveFile();
                    // reset state for new file
                    this.ocrIocs = null;
                    await this.parseIndicators(file);
                }
            })
        );
    }

    registerActiveFileListener() {
        if (!this.plugin) return;
        this.registerEvent(
            this.plugin.app.vault.on('modify', async (file: TAbstractFile) => {
                if (!this.plugin) return;
                if (file === this.plugin.app.workspace.getActiveFile() && file instanceof TFile) {
                    await this.parseIndicators(file);
                }
            })
        );
    }

    /**
     * Update progress stats to reflect both cached and pending attachments
     */
    private updateProgressStats(): void {
        // count attachments that are already processed (in cache)
        const cachedAttachments = this.attachments.filter(att => this.ocrCache.has(att));
        const cachedCount = cachedAttachments.length;

        // count attachments that are currently pending
        const pendingCount = this.pendingAttachments.size;
        
        // total is the sum of both
        const totalAttachments = cachedCount + pendingCount;

        const percentage = totalAttachments > 0
            ? (cachedCount / totalAttachments) * 100
            : 0;
        
        this.progressStats = {
            completedTasks: cachedCount,
            totalTasks: totalAttachments,
            percentage: percentage
        };

        this.isBusy = pendingCount > 0;

        if (this.ocrComponent) {
            this.ocrComponent.$set({
                isBusy: this.isBusy,
                progress: this.progressStats
            });
        }
    }
    
    /**
     * Handle progress events from the OCR provider
     */
    private handleProgressEvent(overallProgress: number, completedTasks: number, totalTasks: number, task?: OcrTask): void {
        // Update progress stats
        this.progressStats = {
            completedTasks: completedTasks,
            totalTasks: totalTasks,
            percentage: overallProgress * 100
        };
        
        this.isBusy = completedTasks < totalTasks;

        // Update the UI component
        if (this.ocrComponent) {
            this.ocrComponent.$set({
                isBusy: this.isBusy,
                progress: this.progressStats
            });
        }
    }

    /**
     * Handle result events from the OCR provider
     */
    private handleResultEvent(filePath: string, indicators: ParsedIndicators[], providerId?: string): void {
        console.log(`Result event for ${filePath} from ${providerId || 'unknown provider'}`);
        
        // Check if we're actually expecting results for this file
        if (!this.pendingAttachments.has(filePath)) {
            console.log(`Ignoring duplicate result for ${filePath}`);
            return;
        }
        
        // Store results in cache
        this.ocrCache.set(filePath, indicators);
        
        // Remove from pending
        this.pendingAttachments.delete(filePath);
        
        // Update the combined results
        this.updateIncrementalResults();
        
        // Update UI with new results
        if (this.ocrComponent && this.ocrIocs) {
            this.ocrComponent.$set({
                indicators: this.ocrIocs
            });
        }
        
        // Update progress stats
        this.updateProgressStats();
    }

    /**
     * Handle task update events from the OCR provider
     */
    private handleTaskUpdateEvent(task: OcrTask, providerId?: string): void {
        if (task.status === 'failed' || task.status === 'cancelled') {
            // Remove failed tasks from pending
            this.pendingAttachments.delete(task.filePath);
            this.updateProgressStats();
        }
    }

    /**
     * Handle completion event from the OCR provider
     */
    private handleCompleteEvent(): void {
        // Finalize progress
        this.isBusy = false;
        
        if (this.ocrComponent) {
            this.ocrComponent.$set({
                isBusy: false,
                progress: {
                    completedTasks: this.attachments.length,
                    totalTasks: this.attachments.length,
                    percentage: 100
                }
            });
        }
    }

    /**
     * Handle error events from the OCR provider
     */
    private handleErrorEvent(error: Error, task?: OcrTask, providerId?: string): void {
        console.error(`OCR Error${providerId ? ` from ${providerId}` : ''}:`, error);
        
        if (task) {
            this.pendingAttachments.delete(task.filePath);
            this.updateProgressStats();
        }
    }

    /**
     * Register event handlers for an OCR provider
     */
    private registerProviderEvents(provider: OcrProvider): void {
        // Store handler references for later cleanup
        const progressHandler = this.handleProgressEvent.bind(this);
        const resultHandler = this.handleResultEvent.bind(this);
        const taskUpdateHandler = this.handleTaskUpdateEvent.bind(this);
        const completeHandler = this.handleCompleteEvent.bind(this);
        const errorHandler = this.handleErrorEvent.bind(this);
        
        // Register event handlers
        provider.on('progress', progressHandler);
        provider.on('result', resultHandler);
        provider.on('taskUpdate', taskUpdateHandler);
        provider.on('complete', completeHandler);
        provider.on('error', errorHandler);
        
        // Store handlers for cleanup
        this.eventHandlers.set('progress', progressHandler);
        this.eventHandlers.set('result', resultHandler);
        this.eventHandlers.set('taskUpdate', taskUpdateHandler);
        this.eventHandlers.set('complete', completeHandler);
        this.eventHandlers.set('error', errorHandler);
    }

    /**
     * Unregister event handlers from an OCR provider
     */
    private unregisterProviderEvents(provider: OcrProvider): void {
        // Remove each handler
        for (const [event, handler] of this.eventHandlers.entries()) {
            provider.off(event as any, handler);
        }
        
        // Clear handler references
        this.eventHandlers.clear();
    }

    /**
     * Reset progress stats to initial state
     */
    private resetProgressStats(): void {
        this.updateProgressStats();
    }

    /**
     * Cancel OCR operations and reset all state
     */
    private cancelAndResetState(): void {
        if (this.ocrProvider) {
            this.ocrProvider.cancel();
        }

        this.pendingAttachments.clear();
        this.resetProgressStats();

        if (this.ocrComponent) {
            this.ocrComponent.$set({
                isBusy: false,
                progress: this.progressStats,
                indicators: this.ocrIocs
            });
        }
    }

    /**
     * Update results incrementally as tasks complete
     */
    private updateIncrementalResults(): void {
        const allIndicators = this.attachments
            .filter(att => this.ocrCache.has(att))
            .flatMap(att => this.ocrCache.get(att) || []);
        
        let combinedIndicators = allIndicators.reduce((acc, curr) => {
            const existingIndex = acc.findIndex(item => item.title === curr.title);
            if (existingIndex !== -1) {
                // Combine items and remove duplicates
                acc[existingIndex].items = [...new Set([...acc[existingIndex].items, ...curr.items])];
                // Merge sites if they exist
                if (curr.sites) {
                    acc[existingIndex].sites = acc[existingIndex].sites || [];
                    acc[existingIndex].sites = [...new Set([...acc[existingIndex].sites, ...curr.sites])];
                }
            } else {
                // Add new indicator type
                acc.push({...curr, items: [...new Set(curr.items)]});
            }
            return acc;
        }, [] as ParsedIndicators[]);
        
        combinedIndicators = processExclusions(combinedIndicators, this.plugin);
        this.ocrIocs = combinedIndicators;
    }
    
    async getOcrMatches(): Promise<void> {
        const app = this.plugin?.app;
    
        if (!app || !this.plugin || !this.ocrProvider || !this.ocrProvider.isReady()) {
            return;
        }
    
        try {
            // Only consider attachments that are:
            // 1. Not already in the cache
            // 2. Not already being processed
            const attachmentsToOcr = this.attachments.filter(att =>
                !this.ocrCache.has(att) && !this.pendingAttachments.has(att)
            );
    
            // update results for any files already in the cache
            this.updateIncrementalResults();
    
            if (attachmentsToOcr.length > 0) {
                this.isBusy = true;
                
                // Mark attachments as pending BEFORE starting processing
                attachmentsToOcr.forEach(att => this.pendingAttachments.add(att));
                
                // Initial progress state
                this.progressStats = {
                    completedTasks: 0,
                    totalTasks: attachmentsToOcr.length,
                    percentage: 0
                };
                
                if (this.ocrComponent) {
                    this.ocrComponent.$set({
                        isBusy: this.isBusy,
                        progress: this.progressStats
                    });
                }
                
                // Start processing - events will handle updates
                await this.ocrProvider.processFiles(app, attachmentsToOcr);
            } else {
                this.updateIncrementalResults();
                this.isBusy = false;
                
                if (this.ocrComponent) {
                    this.ocrComponent.$set({
                        isBusy: false
                    });
                }
            }
        } catch (e) {
            console.error("Error during OCR processing:", e);
            this.isBusy = false;
            
            if (this.ocrComponent) {
                this.ocrComponent.$set({
                    isBusy: false
                });
            }
        }
    }

    /**
     * Compare attachments for the current file against the class's attachment list.
     * @param file the file to evaluate
     * @returns true if attachments are unchanged, false if attachments have changed
     */
    private compareAttachments(file: TFile): boolean {
        if (!this.plugin?.app) return true;
        const attachments = getAttachments(file.path, this.plugin.app);
        const set1 = new Set(attachments);
        const set2 = new Set(this.attachments);

        const unchanged = set1.size === set2.size && [...set1].every(item => set2.has(item));
        
        if (!unchanged) {
            this.attachments = attachments;
        }
        return unchanged;
    }

    async parseIndicators(file: TFile) {
        if (!this.plugin?.app) return;
        
        // Parse main file content
        const fileContent = await this.readFile(file);
        this.iocs = await this.getMatches(fileContent);
        
        const attachmentsChanged = !this.compareAttachments(file);
        if (attachmentsChanged) {
            this.getOcrMatches();
        }

        if (!this.sidebar && this.iocs) {
            this.sidebar = new Sidebar({
                target: this.sidebarTarget,
                props: {
                    indicators: this.iocs
                }
            });
        } else {
            this.sidebar?.$set({
                indicators: this.iocs
            });
        }
        if (!this.ocrComponent) {
            this.ocrComponent = new OcrIocList({
                target: this.sidebarTarget,
                props: {
                    indicators: this.ocrIocs,
                    isBusy: this.isBusy,
                    progress: this.progressStats
                }
            });
        }
        if (this.ocrIocs) {
            this.ocrComponent?.$set({
                indicators: this.ocrIocs ?? []
            })
        }
    }

    /**
     * Update the OCR provider and re-parse indicators
     * @param ocrProvider the new OCR provider to use
     */
    async updateOcrProvider(provider: OcrProvider): Promise<void> {
        // Unregister event handlers from previous provider
        if (this.ocrProvider) {
            this.unregisterProviderEvents(this.ocrProvider);
            this.ocrProvider.cancel();
        }
        
        this.cancelAndResetState();

        // Set the new provider
        this.ocrProvider = provider;

        // Register event handlers with the new provider
        if (this.ocrProvider) {
            this.registerProviderEvents(this.ocrProvider);
        }

        // Process current file if available
        if (this.currentFile) {
            await this.parseIndicators(this.currentFile);
        }
    }

    /**
     * Manually refresh the view
     */
    async refreshView() {
        const file = this.app.workspace.getActiveFile();
        if (file && file != this.currentFile) {
            this.currentFile = file;
            await this.parseIndicators(this.currentFile);
        }
    }

    async onClose() {
        // Clean up event listeners
        if (this.ocrProvider) {
            this.unregisterProviderEvents(this.ocrProvider);
            this.ocrProvider.cancel();
            this.pendingAttachments.clear();
        }

        if (this.ocrComponent) {
            this.ocrComponent.$destroy();
            this.ocrComponent = undefined;
        }

        if (this.sidebar) {
            this.sidebar.$destroy();
            this.sidebar = undefined;
            this.plugin?.sidebarContainers?.delete(this.getViewType());
        }
    }
}