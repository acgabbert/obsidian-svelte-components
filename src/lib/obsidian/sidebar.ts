import { ItemView, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import Sidebar from "../components/Sidebar.svelte";
import { CyberPlugin, DOMAIN_REGEX, extractMatches, filterExclusions, getAttachments, HASH_REGEX, type IndicatorExclusion, IP_REGEX, IPv6_REGEX, isLocalIpv4, ocrMultiple, type ParsedIndicators, refangIoc, removeArrayDuplicates, type SearchSite, validateDomains } from "obsidian-cyber-utils";
import { type Worker } from "tesseract.js"

export const DEFAULT_VIEW_TYPE = "indicator-sidebar";

export const DEFAULT_IPv6_EXCLUSIONS: IndicatorExclusion[] = [
    /^[a-f0-9]*::[a-f0-9]*$/i
]

export const DEFAULT_IPv4_EXCLUSIONS: IndicatorExclusion[] = [
    /1\d{2}\.0\.0\.0/i  // chrome browser versions
]

export class IndicatorSidebar extends ItemView {
    sidebar: Sidebar | undefined;
    iocs: ParsedIndicators[] | undefined;
    plugin: CyberPlugin | undefined;
    splitLocalIp: boolean;

    currentFile: TFile | null;

    ipExclusions: string[] | undefined;
    ipv6Exclusions: string[] | undefined;
    domainExclusions: string[] | undefined;
    hashExclusions: string[] | undefined;
    
    ipRegex = IP_REGEX;
    hashRegex = HASH_REGEX;
    domainRegex = DOMAIN_REGEX;
    ipv6Regex = IPv6_REGEX;
    
    constructor(leaf: WorkspaceLeaf, plugin: CyberPlugin) {
        super(leaf);
        this.iocs = [];
        this.plugin = plugin;
        this.splitLocalIp = true;
        this.currentFile = null;
        this.plugin?.app.workspace.onLayoutReady(() => {
            this.registerActiveFileListener();
            this.registerOpenFile();
        });
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
            sites: this.plugin?.settings?.searchSites.filter((x: SearchSite) => x.enabled && x.ip),
            exclusions: this.ipExclusions ?? []
        }
        const domains: ParsedIndicators = {
            title: "Domains",
            items: extractMatches(fileContent, this.domainRegex),
            sites: this.plugin?.settings?.searchSites.filter((x: SearchSite) => x.enabled && x.domain),
            exclusions: this.domainExclusions ?? []
        }
        const hashes: ParsedIndicators = {
            title: "Hashes",
            items: extractMatches(fileContent, this.hashRegex),
            sites: this.plugin?.settings?.searchSites.filter((x: SearchSite) => x.enabled && x.hash),
            exclusions: this.hashExclusions ?? []
        }
        const privateIps: ParsedIndicators = {
            title: "IPs (Private)",
            items: [],
            sites: this.plugin?.settings?.searchSites.filter((x: SearchSite) => x.enabled && x.ip),
            exclusions: this.ipExclusions ?? []
        }
        const ipv6: ParsedIndicators = {
            title: "IPv6",
            items: extractMatches(fileContent, this.ipv6Regex),
            sites: this.plugin?.settings?.searchSites.filter((x: SearchSite) => x.enabled && x.ip),
            exclusions: this.ipv6Exclusions ?? []
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
        retval = this.refangIocs(retval);
        retval = this.processExclusions(retval);
        return retval;
    }

    protected processExclusions(iocs: ParsedIndicators[]): ParsedIndicators[] {
        return iocs.map(indicatorList => ({
            ...indicatorList,
            items: indicatorList.exclusions 
            ? filterExclusions(indicatorList.items, indicatorList.exclusions)
            : indicatorList.items
        }))
    }

    protected refangIocs(iocs: ParsedIndicators[]): ParsedIndicators[] {
        iocs.forEach((iocList, index, array) => {
            iocList.items = iocList.items.map((x) => refangIoc(x));
            iocList.items = removeArrayDuplicates(iocList.items);
            array[index] = iocList;
        });
        return iocs;
    }

    async parseIndicators(file: TFile) {
        await this.getMatches(await this.readFile(file));
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