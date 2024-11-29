import { ItemView, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import Sidebar from "../components/Sidebar.svelte";
import { CyberPlugin, DOMAIN_REGEX, extractMatches, getAttachments, HASH_REGEX, IP_REGEX, IPv6_REGEX, isLocalIpv4, ocrMultiple, type ParsedIndicators, refangIoc, removeArrayDuplicates, type SearchSite, validateDomains } from "obsidian-cyber-utils";
import { type Worker } from "tesseract.js"

export const DEFAULT_VIEW_TYPE = "indicator-sidebar";

export class IndicatorSidebar extends ItemView {
    sidebar: Sidebar | undefined;
    iocs: ParsedIndicators[] | undefined;
    plugin: CyberPlugin | undefined;
    splitLocalIp: boolean;

    currentFile: TFile | null;
    attachments: string[];
    worker: Worker | null;
    ocrIocs: Promise<ParsedIndicators[]> | null;

    ipExclusions: string[] | undefined;
    domainExclusions: string[] | undefined;
    hashExclusions: string[] | undefined;
    
    ipRegex = IP_REGEX;
    hashRegex = HASH_REGEX;
    domainRegex = DOMAIN_REGEX;
    ipv6Regex = IPv6_REGEX;
    
    constructor(leaf: WorkspaceLeaf, plugin: CyberPlugin, worker?: Worker) {
        super(leaf);
        this.iocs = [];
        this.plugin = plugin;
        this.splitLocalIp = true;
        this.attachments = [];
        this.ocrIocs = null;
        this.currentFile = null;
        if (worker) this.worker = worker;
        else this.worker = null;
        this.plugin?.app.workspace.onLayoutReady(() => {
            this.registerActiveFileListener();
            this.registerOpenFile();
        })
    }

    getViewType(): string {
        return DEFAULT_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Indicator Sidebar";
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

    protected async onOpen(): Promise<void> {
        if (!this.plugin) return;
        const file = this.plugin.app.workspace.getActiveFile();
        if (file) {
            await this.parseIndicators(file);
        }
    }

    async readFile(file: TFile): Promise<string> {
        if (!this.plugin) return "";
        return await this.plugin.app.vault.cachedRead(file);
    }

    /**
     * Extract IOCs from the given file content.
     * @param fileContent content from which to extract IOCs
     * @returns an array of ParsedIndicators objects for each IOC type
     */
    async getMatches(fileContent: string): Promise<ParsedIndicators[]> {
        let retval = [];
        const ips: ParsedIndicators = {
            title: "IPs",
            items: extractMatches(fileContent, this.ipRegex),
            sites: this.plugin?.settings?.searchSites.filter((x: SearchSite) => x.enabled && x.ip)
        }
        const domains: ParsedIndicators = {
            title: "Domains",
            items: extractMatches(fileContent, this.domainRegex),
            sites: this.plugin?.settings?.searchSites.filter((x: SearchSite) => x.enabled && x.domain)
        }
        const hashes: ParsedIndicators = {
            title: "Hashes",
            items: extractMatches(fileContent, this.hashRegex),
            sites: this.plugin?.settings?.searchSites.filter((x: SearchSite) => x.enabled && x.hash)
        }
        const privateIps: ParsedIndicators = {
            title: "IPs (Private)",
            items: [],
            sites: this.plugin?.settings?.searchSites.filter((x: SearchSite) => x.enabled && x.ip)
        }
        const ipv6: ParsedIndicators = {
            title: "IPv6",
            items: extractMatches(fileContent, this.ipv6Regex),
            sites: this.plugin?.settings?.searchSites.filter((x: SearchSite) => x.enabled && x.ip)
        }
        if (this.plugin?.validTld) 
            domains.items = validateDomains(domains.items, this.plugin.validTld);
        if (this.splitLocalIp) {
            ips.title = "IPs (Public)";
            for (let i = 0; i < ips.items.length; i++) {
                const item = ips.items[i];
                if(isLocalIpv4(item)) {
                    ips.items.splice(i, 1);
                    i--;
                    privateIps.items.push(item);
                }
            }
        }
        retval.push(ips);
        if (this.splitLocalIp) retval.push(privateIps);
        retval.push(domains);
        retval.push(hashes);
        retval.push(ipv6)
        this.refangIocs();
        this.processExclusions();
        return retval;
    }
    
    async getOcrMatches(): Promise<ParsedIndicators[]> {
        const app = this.plugin?.app;
        let retval: ParsedIndicators[] = [];
        if (!app || !this.plugin  || !this.worker /*|| !this.plugin.settings.enableOcr*/) {
            return retval;
        }
        return new Promise(async (resolve) => {
            const results = await ocrMultiple(app, this.attachments, this.worker);
            if (!results) {
                resolve(retval);
                return;
            }
            const allResults = Array.from(results.values()).join("\n");
            retval = await this.getMatches(allResults);
            resolve(retval);
            return;
        });
    }

    processExclusions() {
        this.iocs?.forEach(indicatorList => {
            switch(indicatorList.title) {
                case "IPs":
                    this.ipExclusions?.forEach(ip => {
                        if (indicatorList.items.includes(ip)) indicatorList.items.splice(indicatorList.items.indexOf(ip), 1);
                    });
                case "Domains":
                    this.domainExclusions?.forEach(domain => {
                        if (indicatorList.items.includes(domain)) indicatorList.items.splice(indicatorList.items.indexOf(domain), 1);
                    });
                case "Hashes":
                    this.hashExclusions?.forEach(hash => {
                        if (indicatorList.items.includes(hash)) indicatorList.items.splice(indicatorList.items.indexOf(hash), 1);
                    });
            }
        });
    }

    private refangIocs() {
        this.iocs?.forEach((iocList, index, array) => {
            iocList.items = iocList.items.map((x) => refangIoc(x));
            iocList.items = removeArrayDuplicates(iocList.items);
            array[index] = iocList;
        })
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
        if (!this.compareAttachments(file) /*&& this.plugin.settings.enableOcr*/) {
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

    async onClose() {
        if (this.sidebar) {
           this.sidebar?.$destroy();
           this.sidebar = undefined;
           this.plugin?.sidebarContainers?.delete(this.getViewType());
        }
    }
}