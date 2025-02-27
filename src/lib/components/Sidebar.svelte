<script lang="ts">
	import type { ParsedIndicators } from "obsidian-cyber-utils";
    import IocList from "./IocList.svelte";
    export let indicators: ParsedIndicators[];
    $: hasIndicators = indicators.some(list => list.items.length > 0);
</script>

<div class="indicator-sidebar-container">
    <h4>Extracted Indicators</h4>
    {#if hasIndicators}
        {#each indicators as indicatorList}
            {#if indicatorList.items.length > 0}
                <IocList indicatorList={indicatorList}/>
            {/if}
        {/each}
    {:else}
        <div class="empty-state">
            No indicators found.
        </div>
    {/if}
</div>

<style>
    .empty-state {
        text-align: center;
        padding: 2rem;
        color: var(--text-muted);
        font-style: italic;
    }
</style>