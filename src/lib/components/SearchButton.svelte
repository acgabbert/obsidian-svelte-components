<script lang="ts">
    import type { SearchSite } from "obsidian-cyber-utils";

    export let site: SearchSite;
    export let indicator: string;
</script>

<a href={indicator}>
    <button title={site.name}>{site.shortName}</button>
</a>

<style>
	button {
		transform: scale(0.8, 0.8);
	}
</style>