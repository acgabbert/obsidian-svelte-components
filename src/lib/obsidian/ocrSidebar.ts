import type { Worker } from "tesseract.js";
import { IndicatorSidebar } from "./sidebar";
import { getAttachments, ocrMultiple, type CyberPlugin, type ParsedIndicators, type OcrProvider, TesseractOcrProvider, EmptyOcrProvider } from "obsidian-cyber-utils";
import type { TFile, WorkspaceLeaf } from "obsidian";
import Sidebar from "../components/Sidebar.svelte";

export const OCR_VIEW_TYPE = "ocr-indicator-sidebar";

export class OcrSidebar extends IndicatorSidebar {
    attachments: string[];
    ocrProvider: OcrProvider;
    ocrIocs: Promise<ParsedIndicators[]> | null;
    ocrCache: Map<string, ParsedIndicators[]>;

    constructor(leaf: WorkspaceLeaf, plugin: CyberPlugin, ocrProvider?: OcrProvider | null, worker?: Worker | null) {
        super(leaf, plugin);
        this.attachments = [];
        this.ocrIocs = null;
        this.ocrCache = new Map<string, ParsedIndicators[]>();

        if (!ocrProvider && worker) {
            this.ocrProvider = new TesseractOcrProvider(worker, this.getMatches.bind(this));
        } else if (!ocrProvider) {
            this.ocrProvider = new EmptyOcrProvider();
        } else {
            this.ocrProvider = ocrProvider;
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
                    this.ocrIocs = null;
                    await this.parseIndicators(file);
                }
            })
        );
    }
    
    async getOcrMatches(): Promise<ParsedIndicators[]> {
        const app = this.plugin?.app;
        let retval: ParsedIndicators[] = [];
        if (!app || !this.plugin) {
            return retval;
        }

        if (!this.ocrProvider.isReady()) {
            return retval;
        }

        return new Promise(async (resolve) => {
            const attachmentsToOcr = this.attachments.filter(att => !this.ocrCache.has(att));
            if (attachmentsToOcr.length > 0) {
                const results = await this.ocrProvider.processFiles(app, attachmentsToOcr);

                // Parse OCR results and update cache
                for (const [filename, iocs] of results.entries()) {
                    this.ocrCache.set(filename, iocs);
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
                        acc[existingIndex].sites = [...new Set([...acc[existingIndex].sites, ...curr.sites])]
                    }
                } else {
                    // Add new indicator type
                    acc.push({...curr, items: [...new Set(curr.items)]})
                }
                return acc;
            }, [] as ParsedIndicators[]);
            
            combinedIndicators = this.processExclusions(combinedIndicators);
            resolve(combinedIndicators);
            return;
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
        const set1 = new Set(attachments);
        const set2 = new Set(this.attachments);
        if (set1.size === set2.size && [...set1].every(item => set2.has(item))) {
            return true;
        } else {
            this.attachments = attachments;
            return false;
        }
    }

    async parseIndicators(file: TFile) {
        if (!this.plugin?.app) return;
        const fileContent = await this.readFile(file);
        this.iocs = await this.getMatches(fileContent);
        if (!this.compareAttachments(file)) {
            // attachments changed
            this.ocrIocs = this.getOcrMatches();
        }
        if (!this.sidebar && this.iocs) {
            this.sidebar = new Sidebar({
                target: this.contentEl,
                props: {
                    indicators: this.iocs
                }
            });
        } else {
            this.sidebar?.$set({
                indicators: this.iocs
            });
        }
    }

    /**
     * Update the OCR provider and refresh the view.
     * @param ocrProvider the new OCR provider to use
     */
    async updateOcrProvider(ocrProvider: OcrProvider): Promise<void> {
        this.ocrProvider = ocrProvider;
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
        await this.refreshView();
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