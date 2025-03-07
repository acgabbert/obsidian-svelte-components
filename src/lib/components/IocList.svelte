<script lang="ts">
	import type { ParsedIndicators } from "obsidian-cyber-utils";
    
    import Item from "./Item.svelte";
	import Button from "./Button.svelte";

    export let indicatorList: ParsedIndicators;
    let multisearchLinks = new Map<string, string>();
    let open = true;
    if (indicatorList.title.contains("Private")) open = false;
    $: {
        multisearchLinks.clear();
        indicatorList.sites?.forEach((site) => {
            if (site.multisearch && indicatorList.items.length > 1) {
                indicatorList.items.forEach((item) => {
                    if (!multisearchLinks.has(site.shortName)) {
                        multisearchLinks.set(site.shortName, site.site.replace('%s', item));
                    } else {
                        const url = multisearchLinks.get(site.shortName);
                        if (!url) {
                            multisearchLinks.set(
                                site.shortName,
                                site.site.replace(
                                    '%s',
                                    site.urlEncodeSearchTerm ? 
                                        encodeURIComponent(item)
                                        : item
                                )
                            );
                        } else if (!url.includes(item)) {
                            multisearchLinks.set(
                                site.shortName,
                                url + site.separator + (site.urlEncodeSearchTerm ?
                                    encodeURIComponent(item)
                                    : item)
                            );
                        }
                    }
                })
            }
        });
    }

    function getMultisearchLink(shortName: string): string {
        const href = multisearchLinks.get(shortName);
        if (href === undefined) {
            throw new Error(`No multisearch link found for ${shortName}`);
        }
        return href;
    }
</script>

<details class="sidebar-container tree-item" {open}>
    <summary class="tree-item-inner">{indicatorList.title}</summary>
    <div class="tree-item-children">
        {#each indicatorList.items as item}
            <Item indicator={item} sites={indicatorList.sites}/>
        {/each}
    </div>
    {#if indicatorList.sites}
    <div class="grid-container">
        {#each indicatorList.sites as site}
            {#if site.multisearch && multisearchLinks.has(site.shortName)}
                <Button 
                    href={getMultisearchLink(site.shortName)}
                    content={`Search all - ${site.shortName}`}
                    title={`Search all - ${site.name}`}
                />
            {/if}
        {/each}
    </div>
    {/if}
</details>