import type { Worker } from "tesseract.js";
import { IndicatorSidebar } from "./sidebar";
import { getAttachments, type CyberPlugin, type ParsedIndicators, type OcrProvider, TesseractOcrProvider, EmptyOcrProvider } from "obsidian-cyber-utils";
import type { App, TFile, WorkspaceLeaf } from "obsidian";
import Sidebar from "../components/Sidebar.svelte";
import OcrIocList from "../components/OcrIocList.svelte";
import { ParallelOcrProvider } from "./parallelOcrProvider";

export const OCR_VIEW_TYPE = "ocr-indicator-sidebar";

export enum ProcessingMode {
    SEQUENTIAL = "sequential",
    PARALLEL = "parallel"
}

export interface OcrSidebarConfig {
    processingMode: ProcessingMode,
    maxConcurrent: number
}

export class OcrSidebar extends IndicatorSidebar {
    attachments: string[];
    ocrProvider: OcrProvider;
    wrappedProvider: ParallelOcrProvider | null = null;
    ocrIocs: ParsedIndicators[] = [];
    ocrIocsPromise: Promise<ParsedIndicators[]> | null = null; // for backward compatibility
    ocrCache: Map<string, ParsedIndicators[]>;
    isProcessing: boolean = false;
    progressStats: { total: number, completed: number } = { total: 0, completed: 0 };
    ocrListComponent: OcrIocList | null = null;
    config: OcrSidebarConfig;
    protected currentProcessingOperation: { cancel: boolean } = { cancel: false };

    constructor(
        leaf: WorkspaceLeaf,
        plugin: CyberPlugin,
        ocrProvider?: OcrProvider | null,
        worker?: Worker | null,
        config?: Partial<OcrSidebarConfig>
    ) {
        super(leaf, plugin);
        this.attachments = [];
        this.ocrCache = new Map<string, ParsedIndicators[]>();

        // default config
        this.config = {
            processingMode: ProcessingMode.PARALLEL,
            maxConcurrent: 3,
            ...config
        }

        // set up the base OCR provider
        if (!ocrProvider && worker) {
            this.ocrProvider = new TesseractOcrProvider(worker, this.getMatches.bind(this));
        } else if (!ocrProvider) {
            this.ocrProvider = new EmptyOcrProvider();
        } else {
            this.ocrProvider = ocrProvider;
        }

        this.createWrappedProvider();

        this.plugin?.app.workspace.onLayoutReady(() => {
            this.registerActiveFileListener();
            this.registerOpenFile();
        });
    }

    protected createWrappedProvider(): void {
        const progressCallback: OcrProgressCallback = (completed, total, currentResults) => {
            this.progressStats = {completed, total};

            if (currentResults.size > 0) {
                const allIndicators = this.attachments.flatMap(att => {
                    if (currentResults.has(att)) {
                        return currentResults.get(att) || [];
                    }
                    return this.ocrCache.get(att) || [];
                });

                this.ocrIocs = this.combineAndProcessIndicators(allIndicators);
                this.updateOcrComponent();
            }
        }

        this.wrappedProvider = new ParallelOcrProvider(
            this.ocrProvider,
            this.config.maxConcurrent,
            progressCallback
        )
    }

    /**
     * Update the processing configuration
     */
    updateConfig(config: Partial<OcrSidebarConfig>): void {
        this.config = {
            ...this.config,
            ...config
        }

        if (this.wrappedProvider) {
            this.wrappedProvider.setMaxConcurrent(this.config.maxConcurrent);
        }
    }

    protected combineAndProcessIndicators(indicators: ParsedIndicators[]): ParsedIndicators[] {
        // Combine indicators by type and remove duplicates
        let combinedIndicators = indicators.reduce((acc, curr) => {
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
        
        // Apply exclusions
        return this.processExclusions(combinedIndicators);        
    }

    getViewType(): string {
        return OCR_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "OCR Indicator Sidebar";
    }

    registerOpenFile() {
        this.registerEvent(
            this.app.workspace.on('file-open', async (file: TFile | null) => {
                if (file && file === this.app.workspace.getActiveFile() && file != this.currentFile) {
                    this.currentFile = this.app.workspace.getActiveFile();
                    // reset state for new file
                    this.ocrIocs = [];
                    this.ocrIocsPromise = null;
                    this.isProcessing = false;
                    this.progressStats = {total: 0, completed: 0};
                    await this.parseIndicators(file);
                }
            })
        );
    }

    /**
     * Cancel the current processing operation
     */
    protected cancelCurrentProcessing(): void {
        if (this.isProcessing) {
            this.currentProcessingOperation.cancel = true;
            this.isProcessing = false;
            this.updateOcrComponent();
            console.debug("Cancelled ongoing OCR processing");
        }
    }
    
    async processOcrMatches(): Promise<ParsedIndicators[]> {
        const app = this.plugin?.app;
        if (!app || !this.plugin || !this.wrappedProvider || !this.wrappedProvider.isReady()) {
            return [];
        }

        // create a reference to the current processing operation for cancellation
        const processingOperation = this.currentProcessingOperation;

        this.isProcessing = true;
        this.updateOcrComponent();

        const cachedAttachments = this.attachments.filter(att => this.ocrCache.has(att));
        if (cachedAttachments.length > 0) {
            const cachedIndicators = cachedAttachments.flatMap(att => this.ocrCache.get(att) || []);
            this.ocrIocs =this.combineAndProcessIndicators(cachedIndicators);
            this.updateOcrComponent();
        }

        if (processingOperation.cancel) {
            this.isProcessing = false;
            this.updateOcrComponent();
            return this.ocrIocs;
        }

        let attachmentsToOcr = this.attachments.filter(att => !this.ocrCache.has(att));

        if (attachmentsToOcr.length > 0 && this.wrappedProvider) {
            attachmentsToOcr = this.prioritizeAttachments(attachmentsToOcr);

            this.progressStats = {total: attachmentsToOcr.length, completed: 0};
            this.updateOcrComponent();

            try {
                const processingWithCancellation = async (filePaths: string[]): Promise<Map<string, ParsedIndicators[]>> => {
                    const results = new Map<string, ParsedIndicators[]>();
                    // Process files with cancellation checks
                    for (let i = 0; i < filePaths.length; i += this.config.maxConcurrent) {
                        if (!this.wrappedProvider || processingOperation.cancel) {
                            break;
                        }

                        const batchFiles = filePaths.slice(i, i + this.config.maxConcurrent);
                        const batchResults = await this.wrappedProvider.processFiles(app, batchFiles);

                        // merge batch results into overall results
                        for (const [path, indicators] of batchResults?.entries()) {
                            results.set(path, indicators);

                            // update the cache immediately for each processed file
                            this.ocrCache.set(path, indicators);

                            // update the UI with the latest combined results
                            const allIndicators = this.attachments
                                .filter(att => this.ocrCache.has(att))
                                .flatMap(att => this.ocrCache.get(att) || []);
                            
                            this.ocrIocs = this.combineAndProcessIndicators(allIndicators);
                            this.updateOcrComponent();
                        }

                        // check for cancellation after processing each batch
                        if (processingOperation.cancel) {
                            break;
                        }
                    }

                    return results;
                };

                await processingWithCancellation(attachmentsToOcr);
            } catch (error) {
                console.error("Error processing OCR matches:", error);
            }
        }

        if (!processingOperation.cancel) {
            this.isProcessing = false;
            this.updateOcrComponent();
        }

        return this.ocrIocs;
    }

    /**
     * Prioritize attachments to optimize processing order
     * @param attachments list of attachments to prioritize
     * @returns prioritized list of attachments
     */
    protected prioritizeAttachments(attachments: string[]): string[] {
        if (!attachments.length) return attachments;

        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff'];

        return [...attachments].sort((a, b) => {
            const aExt = a.toLowerCase().substring(a.lastIndexOf('.'));
            const bExt = b.toLowerCase().substring(b.lastIndexOf('.'));

            const aIsImage = imageExtensions.includes(aExt);
            const bIsImage = imageExtensions.includes(bExt);

            if (aIsImage && !bIsImage) return -1;
            if (!aIsImage && bIsImage) return 1;

            return a.localeCompare(b);
        })
    }

    protected updateOcrComponent(): void {
        if (this.ocrListComponent) {
            this.ocrListComponent.$set({
                indicators: this.ocrIocs,
                isLoading: this.isProcessing,
                progressStats: this.progressStats
            })
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
            // Attachments have changed, clear processing state
            this.cancelCurrentProcessing();
            
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
        
        if (!this.sidebar && this.iocs) {
            this.sidebar = new Sidebar({
                target: this.sidebarTarget,
                props: {
                    indicators: this.iocs
                }
            });

            this.ocrListComponent = new OcrIocList({
                target: this.sidebarTarget,
                props: {
                    indicators: this.ocrIocs,
                    isLoading: this.isProcessing,
                    progressStats: this.progressStats
                }
            });
        } else {
            this.sidebar?.$set({
                indicators: this.iocs
            });
        }

        if (attachmentsChanged) {
            this.ocrIocsPromise = this.processOcrMatches();
        }
    }

    /**
     * Update the OCR provider and refresh the view.
     * @param ocrProvider the new OCR provider to use
     */
    async updateOcrProvider(ocrProvider: OcrProvider): Promise<void> {
        this.ocrProvider = ocrProvider;
        this.createWrappedProvider();
        await this.refreshView();
    }

    /**
     * Add a worker to the class and re-parse indicators.
     * @param worker a tesseract.js worker
     */
    async updateWorker(worker: Worker): Promise<void> {
        // If the current provider is TesseractOcrProvider, update its worker
        if (this.ocrProvider instanceof TesseractOcrProvider) {
            this.ocrProvider.updateWorker(worker);
        } else {
            this.ocrProvider = new TesseractOcrProvider(worker, this.getMatches.bind(this));
        }
        this.createWrappedProvider();
        await this.refreshView();
    }

    /**
     * Reset the OCR state completely, clearing the cache and all indicators
     */
    resetOcrState(): void {
        this.cancelCurrentProcessing();
        this.ocrCache.clear();
        this.ocrIocs = [];
        this.progressStats = { total: 0, completed: 0 };

        this.updateOcrComponent();

        if (this.currentFile) {
            this.refreshView();
        }
    }

    /**
     * Manually refresh the view
     */
    async refreshView() {
       let file = this.app.workspace.getActiveFile();
       if (file && file != this.currentFile) {
            this.currentFile = file;
            await this.parseIndicators(this.currentFile);
       }
    }

    async onClose() {
        if (this.sidebar) {
            this.sidebar.$destroy();
            this.sidebar = undefined;
            this.plugin?.sidebarContainers?.delete(this.getViewType());
        }
    }
}

export type OcrProgressCallback = (completed: number, total: number, results: Map<string, ParsedIndicators[]>) => void;

/**
 * Wrapper for OcrProvider to support incremental processing and progress updates.
 */
class IncrementalOcrProvider implements OcrProvider {
    private baseProvider: OcrProvider;
    private progressCallback: OcrProgressCallback | null = null;

    constructor(baseProvider: OcrProvider, progressCallback?: OcrProgressCallback) {
        this.baseProvider = baseProvider;
        if (progressCallback) {
            this.progressCallback = progressCallback;
        }
    }
    
    /**
     * Check if the underlying OCR provider is ready
     */
    isReady(): boolean {
        return this.baseProvider.isReady();
    }
    
    /**
     * Process files incrementally, calling the progress callback after each file
     */
    async processFiles(app: App, filePaths: string[]): Promise<Map<string, ParsedIndicators[]>> {
        const results = new Map<string, ParsedIndicators[]>();
        
        // If the provider is not ready or there are no files, return empty results
        if (!this.isReady() || filePaths.length === 0) {
            return results;
        }
        
        // Process each file one by one
        for (let i = 0; i < filePaths.length; i++) {
            const filePath = filePaths[i];
            
            try {
                // Process a single file using the base provider
                const singleFileResult = await this.baseProvider.processFiles(app, [filePath]);
                
                // Add results to our accumulated results
                for (const [path, indicators] of singleFileResult.entries()) {
                    results.set(path, indicators);
                }
                
                // Call progress callback if provided
                if (this.progressCallback) {
                    this.progressCallback(i + 1, filePaths.length, new Map(results));
                }
            } catch (error) {
                console.error(`Error processing file ${filePath}:`, error);
                // Continue with the next file even if this one failed
            }
        }
        
        return results;
    }
    
    /**
     * Set a new progress callback
     */
    setProgressCallback(callback: OcrProgressCallback | null): void {
        this.progressCallback = callback;
    }
    
    /**
     * Pass through to the underlying provider for any provider-specific methods
     */
    getBaseProvider(): OcrProvider {
        return this.baseProvider;
    }
}