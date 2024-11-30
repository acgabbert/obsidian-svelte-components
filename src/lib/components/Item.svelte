<script lang="ts">
	import type { SearchSite } from "obsidian-cyber-utils";
    import SearchButton from "./SearchButton.svelte";

    export let indicator: string;
    export let sites: SearchSite[] | undefined;
</script>

<div class="sidebar-list-item tree-item-self">
    <div class="tree-item-inner">{indicator}</div>
</div>
{#if sites}
<div class="grid-container">
    {#each sites as site}
        <SearchButton {site} {indicator}/>
    {/each}
</div>
{/if}