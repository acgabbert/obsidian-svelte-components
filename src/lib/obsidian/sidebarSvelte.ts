import { ItemView, TAbstractFile, TFile, WorkspaceLeaf } from "obsidian";
import Sidebar from "../components/Sidebar.svelte";
import { CyberPlugin, DOMAIN_REGEX, extractMatches, HASH_REGEX, IP_REGEX, IPv6_REGEX, isLocalIpv4, type ParsedIndicators, refangIoc, removeArrayDuplicates, type searchSite, validateDomains } from "obsidian-cyber-utils";

export const SVELTE_VIEW_TYPE = "Svelte-Sidebar";

export class SvelteSidebar extends ItemView {
    sidebar: Sidebar | undefined;
    iocs: ParsedIndicators[] | undefined;
    ocrIocs: ParsedIndicators[] | undefined;
    ocr: boolean = false;
    plugin: CyberPlugin | undefined;
    splitLocalIp: boolean;

    ipExclusions: string[] | undefined;
    domainExclusions: string[] | undefined;
    hashExclusions: string[] | undefined;
    
    ipRegex = IP_REGEX;
    hashRegex = HASH_REGEX;
    domainRegex = DOMAIN_REGEX;
    ipv6Regex = IPv6_REGEX;
    
    constructor(leaf: WorkspaceLeaf, plugin: CyberPlugin, ocr?: boolean) {
        super(leaf);
        this.registerActiveFileListener();
        this.registerOpenFile();
        this.iocs = [];
        this.plugin = plugin;
        this.splitLocalIp = true;
        if (ocr) this.ocr = ocr;
    }

    getViewType(): string {
        return SVELTE_VIEW_TYPE;
    }

    getDisplayText(): string {
        return "Svelte Sidebar";
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
                if (file && file === this.app.workspace.getActiveFile()) {
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
            if (this.iocs) {
                this.sidebar = new Sidebar({
                    target: this.contentEl,
                    props: {
                        indicators: this.iocs,
                        ocrIndicators: this.ocrIocs
                    }
                });
            }
        }
    }

    async getMatches(file: TFile) {
        if (!this.plugin) return;
        const fileContent = await this.plugin.app.vault.cachedRead(file);
        this.iocs = [];
        const ips: ParsedIndicators = {
            title: "IPs",
            items: extractMatches(fileContent, this.ipRegex),
            sites: this.plugin?.settings?.searchSites.filter((x: searchSite) => x.enabled && x.ip)
        }
        const domains: ParsedIndicators = {
            title: "Domains",
            items: extractMatches(fileContent, this.domainRegex),
            sites: this.plugin?.settings?.searchSites.filter((x: searchSite) => x.enabled && x.domain)
        }
        const hashes: ParsedIndicators = {
            title: "Hashes",
            items: extractMatches(fileContent, this.hashRegex),
            sites: this.plugin?.settings?.searchSites.filter((x: searchSite) => x.enabled && x.hash)
        }
        const privateIps: ParsedIndicators = {
            title: "IPs (Private)",
            items: [],
            sites: this.plugin?.settings?.searchSites.filter((x: searchSite) => x.enabled && x.ip)
        }
        const ipv6: ParsedIndicators = {
            title: "IPv6",
            items: extractMatches(fileContent, this.ipv6Regex),
            sites: this.plugin?.settings?.searchSites.filter((x: searchSite) => x.enabled && x.ip)
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
        this.iocs.push(ips);
        if (this.splitLocalIp) this.iocs.push(privateIps);
        this.iocs.push(domains);
        this.iocs.push(hashes);
        this.iocs.push(ipv6)
        this.refangIocs();
        this.processExclusions();
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

    async parseIndicators(file: TFile) {
        await this.getMatches(file);
        this.sidebar?.$set({
            indicators: this.iocs
        });
    }

    async onClose() {
        this.sidebar?.$destroy();
    }
}