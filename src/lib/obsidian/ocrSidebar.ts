import type { Worker } from "tesseract.js";
import { IndicatorSidebar } from "./sidebar";
import { getAttachments, ocrMultiple, type CyberPlugin, type ParsedIndicators } from "obsidian-cyber-utils";
import type { TFile, WorkspaceLeaf } from "obsidian";
import Sidebar from "../components/Sidebar.svelte";

export const OCR_VIEW_TYPE = "ocr-indicator-sidebar";

export class OcrSidebar extends IndicatorSidebar {
    attachments: string[];
    worker: Worker | null;
    ocrIocs: Promise<ParsedIndicators[]> | null;
    ocrCache: Map<string, ParsedIndicators[]>;

    constructor(leaf: WorkspaceLeaf, plugin: CyberPlugin, worker: Worker | null) {
        super(leaf, plugin);
        this.attachments = [];
        this.ocrIocs = null;
        this.worker = worker;
        this.plugin?.app.workspace.onLayoutReady(() => {
            this.registerActiveFileListener();
            this.registerOpenFile();
        });
        this.ocrCache = new Map<string, ParsedIndicators[]>();
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
        if (!app || !this.plugin  || !this.worker) {
            return retval;
        }
        return new Promise(async (resolve) => {
            let attachmentsToOcr = this.attachments.filter(att => !this.ocrCache.has(att));
            if (attachmentsToOcr.length > 0) {
                const results = await ocrMultiple(app, attachmentsToOcr, this.worker);
                if (!results) {
                    resolve(retval);
                    return;
                }

                // Parse OCR results and update cache
                for (const [filename, ocrText] of results.entries()) {
                    const iocs = await this.getMatches(ocrText);
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
     * Add a worker to the class and re-parse indicators.
     * @param worker a tesseract.js worker
     */
    async updateWorker(worker: Worker) {
        this.worker = worker;
        if (this.currentFile) {
            await this.parseIndicators(this.currentFile);
        }
    }
}