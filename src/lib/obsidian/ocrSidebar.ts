import type { Worker } from "tesseract.js";
import { IndicatorSidebar } from "./sidebar";
import { getAttachments, type CyberPlugin, type ParsedIndicators, type OcrProvider, TesseractOcrProvider, EmptyOcrProvider, type OcrTask } from "obsidian-cyber-utils";
import { TFile, type App, type TAbstractFile, type WorkspaceLeaf } from "obsidian";
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

export class OcrSidebar extends IndicatorSidebar {
    attachments: string[];
    ocrProvider: OcrProvider | null;
    ocrIocs: Promise<ParsedIndicators[]> | null;
    ocrCache: Map<string, ParsedIndicators[]>;
    processingTasks: Map<string, string>;
    progressPercentage: number = 0;
    isBusy: boolean = false;
    ocrComponent: OcrIocList | undefined;

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

        this.plugin?.app.workspace.onLayoutReady(() => {
            this.registerActiveFileListener();
            this.registerOpenFile();
        });
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
                    console.log("resetting OCR IOCs");
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
     * Handle progress updates from the OCR provider
     */
    private handleProgressUpdate(overallProgress: number, completedTasks: number, totalTasks: number, currentTask?: OcrTask): void {
        this.progressPercentage = overallProgress;
        this.isBusy = completedTasks < totalTasks;

        if (this.ocrComponent) {
            this.ocrComponent.$set({
                progress: {
                    percentage: this.progressPercentage,
                    isBusy: this.isBusy,
                    completedTasks,
                    totalTasks
                }
            });
        }

        if (currentTask && currentTask.status === 'completed' && currentTask.indicators) {
            const filePath = currentTask.filePath;
            this.ocrCache.set(filePath, currentTask.indicators);
        }
    }
    
    async getOcrMatches(): Promise<ParsedIndicators[]> {
        console.log("entering ocr match function");
        const app = this.plugin?.app;
        let retval: ParsedIndicators[] = [];

        if (!app || !this.plugin || !this.ocrProvider || !this.ocrProvider.isReady()) {
            return retval;
        }

        return new Promise(async (resolve) => {
            const attachmentsToOcr = this.attachments.filter(att => !this.ocrCache.has(att));
            console.log("found attachments to OCR: ", attachmentsToOcr)

            if (attachmentsToOcr.length > 0) {
                this.isBusy = true;
                if (this.ocrComponent) {
                    this.ocrComponent.$set({
                        progress: {
                            percentage: 0,
                            isBusy: this.isBusy,
                            completedTasks: 0,
                            totalTasks: attachmentsToOcr.length
                        }
                    });
                }

                try {
                    console.log("processing via OCR:", attachmentsToOcr);
                    const results = await this.ocrProvider?.processFiles(app, attachmentsToOcr);

                    if (!results) return retval;

                    for (const [filePath, indicators] of results?.entries()) {
                        this.ocrCache.set(filePath, indicators);
                    }
                } catch (e) {
                    console.error("Error during OCR processing:", e);
                } finally {
                    this.isBusy = false;
                    if (this.ocrComponent) {
                        this.ocrComponent.$set({
                            progress: {
                                percentage: 100,
                                isBusy: false,
                                completedTasks: attachmentsToOcr.length,
                                totalTasks: attachmentsToOcr.length
                            }
                        });
                    }
                }
            }

            // Combine all indicators from current attachments
            const allIndicators = this.attachments.flatMap(att => this.ocrCache.get(att) || []);

            // Combine indicators by type and remove duplicates
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

            combinedIndicators = this.processExclusions(combinedIndicators);
            resolve(combinedIndicators);
        });
    }

    /**
     * Compare attachments for the current file against the class's attachment list.
     * @param file the file to evaluate
     * @returns true if attachments are unchanged, false if attachments have changed
     */
    private compareAttachments(file: TFile): boolean {
        if (!this.plugin?.app) return true;
        const attachments = getAttachments(file.path, this.plugin.app);
        console.log("getting attachments", attachments);
        const set1 = new Set(attachments);
        const set2 = new Set(this.attachments);

        const unchanged = set1.size === set2.size && [...set1].every(item => set2.has(item));
        
        if (!unchanged) {
            this.attachments = attachments;
        }
        console.log("returning attachments changed: ", unchanged);
        return unchanged;
    }

    async parseIndicators(file: TFile) {
        if (!this.plugin?.app) return;
        
        // Parse main file content
        const fileContent = await this.readFile(file);
        this.iocs = await this.getMatches(fileContent);
        
        const attachmentsChanged = !this.compareAttachments(file);
        console.log("attachments changed? ", attachmentsChanged);
        if (attachmentsChanged) {
            if (this.ocrProvider) {
                this.ocrProvider.cancel();
            }

            this.ocrIocs = this.getOcrMatches();
        }

        if (!this.sidebar && this.iocs) {
            this.sidebar = new Sidebar({
                target: this.sidebarTarget,
                props: {
                    indicators: this.iocs
                }
            });

            this.ocrComponent = new OcrIocList({
                target: this.sidebarTarget,
                props: {
                    indicators: this.ocrIocs ?? [],
                    progress: {
                        percentage: this.progressPercentage,
                        isBusy: this.isBusy,
                        completedTasks: 0,
                        totalTasks: 0
                    }
                }
            });
        } else {
            this.sidebar?.$set({
                indicators: this.iocs
            });

            this.ocrComponent?.$set({
                indicators: this.ocrIocs ?? [],
                progress: {
                    percentage: this.progressPercentage,
                    isBusy: this.isBusy,
                    completedTasks: 0,
                    totalTasks: 0
                }
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
            this.ocrProvider.cancel();
        }

        this.ocrProvider = provider;

        if (this.ocrProvider) {
            this.ocrProvider.setProgressCallback(this.handleProgressUpdate.bind(this));
        }

        if (this.currentFile) {
            await this.parseIndicators(this.currentFile);
        }
    }

    protected updateOcrComponent(): void {
        if (this.ocrComponent && this.ocrIocs) {
            this.ocrComponent.$set({
                indicators: this.ocrIocs,
                progress: {
                    percentage: this.progressPercentage,
                    isBusy: this.isBusy,
                    completedTasks: 0,
                    totalTasks: 0
                }
            })
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
        if (this.ocrProvider) {
            this.ocrProvider.cancel();
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