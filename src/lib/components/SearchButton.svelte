<script lang="ts">
    import type { SearchSite } from "obsidian-cyber-utils";

    export let site: SearchSite;
    export let indicator: string;

    function craftSearchLink(site: SearchSite, indicator: string) {
        return site.site.replace(
            "%s",
            site.urlEncodeSearchTerm ?
                encodeURIComponent(indicator)
                : indicator
        );
    }
</script>

<a href={craftSearchLink(site, indicator)}>
    <button title={site.name}>{site.shortName}</button>
</a>

<style>
	button {
		transform: scale(0.8, 0.8);
	}
</style>