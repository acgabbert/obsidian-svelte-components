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

    constructor(
        leaf: WorkspaceLeaf,
        plugin: CyberPlugin,
        ocrProvider: OcrProvider | null
    ) {
        super(leaf, plugin);
        this.attachments = [];
        this.ocrIocs = null;
        this.ocrProvider = ocrProvider;
        this.ocrCache = new Map<string, ParsedIndicators[]>();
        this.processingTasks = new Map<string, string>();

        if (this.ocrProvider) {
            this.ocrProvider.setProgressCallback(this.handleProgressUpdate.bind(this));
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
     * Handle progress updates from the OCR provider
     */
    private handleProgressUpdate(overallProgress: number, completedTasks: number, totalTasks: number, currentTask?: OcrTask): void {
        // Only update if we're processing attachments
        if (this.pendingAttachments.size > 0) {
            if (currentTask && currentTask.status === 'completed' && currentTask.indicators) {
                const filePath = currentTask.filePath;
                this.ocrCache.set(filePath, currentTask.indicators);
                this.pendingAttachments.delete(filePath);
    
                this.updateIncrementalResults();
            } else if (currentTask && (currentTask.status === 'failed' || currentTask.status === 'cancelled')) {
                this.pendingAttachments.delete(currentTask.filePath);
            }

            this.updateProgressStats();
        }
        this.progressStats = {
            completedTasks: completedTasks,
            totalTasks: totalTasks,
            percentage: overallProgress
        };
        this.isBusy = completedTasks < totalTasks;

        if (currentTask && currentTask.status === 'completed' && currentTask.indicators) {
            const filePath = currentTask.filePath;
            this.ocrCache.set(filePath, currentTask.indicators);
            this.pendingAttachments.delete(filePath);

            this.updateIncrementalResults();
        } else if (currentTask && (currentTask.status === 'failed' || currentTask.status === 'cancelled')) {
            this.pendingAttachments.delete(currentTask.filePath);
        }

        if (this.ocrComponent) {
            this.ocrComponent.$set({
                isBusy: this.isBusy,
                progress: this.progressStats
            });
        }

        if (currentTask && currentTask.status === 'completed' && currentTask.indicators) {
            const filePath = currentTask.filePath;
            this.ocrCache.set(filePath, currentTask.indicators);
            if (this.ocrComponent && this.ocrIocs) {
                this.ocrComponent?.$set({
                    indicators: this.ocrIocs
                });
            }
        }
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
            this.isBusy = true;
            const attachmentsToOcr = this.attachments.filter(att =>
                !this.ocrCache.has(att) && !this.pendingAttachments.has(att)
            );

            // update results for any files already in the cache
            this.updateIncrementalResults();

            if (attachmentsToOcr.length > 0) {
                attachmentsToOcr.forEach(att => this.pendingAttachments.add(att));
                this.progressStats = {
                    completedTasks: 0,
                    totalTasks: attachmentsToOcr.length,
                    percentage: 0
                };
                if (this.ocrComponent) {
                    this.ocrComponent.$set({
                        isBusy: this.isBusy,
                        progress: this.progressStats
                    })
                }
                await this.ocrProvider?.processFiles(app, attachmentsToOcr);
            } else {
                this.updateIncrementalResults();
            }
        } catch (e) {
            console.error("Error during OCR processing:", e);
        } finally {
            if (this.pendingAttachments.size === 0) {
                this.progressStats = {
                    percentage: 100,
                    totalTasks: 0,
                    completedTasks: 0
                }
                this.isBusy = false;
                if (this.ocrComponent) {
                    this.ocrComponent.$set({
                        isBusy: false,
                        progress: this.progressStats
                    })
                }
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
        // Cancel any ongoing OCR operations
        if (this.ocrProvider) {
            this.ocrProvider.setProgressCallback(() => null);
        }
        
        this.cancelAndResetState();

        this.ocrProvider = provider;

        if (this.ocrProvider) {
            this.ocrProvider.setProgressCallback(this.handleProgressUpdate.bind(this));
        }

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
        if (this.ocrProvider) {
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