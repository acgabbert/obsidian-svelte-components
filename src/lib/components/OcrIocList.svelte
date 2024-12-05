<script lang="ts">
    import type { ParsedIndicators } from "obsidian-cyber-utils";
    import IocList from "./IocList.svelte";
    import { slide } from "svelte/transition";
    export let indicators: Promise<ParsedIndicators[]>;
    let isCollapsed = false;
    function toggleCollapse() {
        isCollapsed = !isCollapsed;
    }
    function hasIndicators(indicators: ParsedIndicators[]): boolean {
        return indicators.some(indicator => indicator.items.length > 0);
    }
</script>

<div class="collapsible">
    <button class="header-button" on:click={toggleCollapse} aria-expanded={!isCollapsed}>
        <span>{isCollapsed ? "+" : "-"}</span> OCR Indicators
    </button>
    {#await indicators}
        <p>Loading...</p>
    {:then indicators}
        {#if !isCollapsed}
            {#if hasIndicators(indicators)}
                {#if !isCollapsed && indicators.length > 0}
                    <div class="ocr-content" transition:slide>
                        {#each indicators as indicatorList}
                            {#if indicatorList.items.length > 0}
                                <IocList {indicatorList}/>
                            {/if}
                        {/each}
                    </div>
                {/if}
            {:else}
                <i style="color: var(--text-muted);">No indicators found in attachment files.</i>
            {/if}
        {/if}
    {/await}
</div>

<style>
    .collapsible {
        overflow: hidden;
    }

    .header-button {
        all: unset;
        cursor: pointer;
        font-size: var(--h4-size);
        font-weight: var(--h4-weight);
    }

    .empty-state {
        text-align: center;
        padding: 2rem;
        color: var(--text-muted);
        font-style: italic;
    }
</style>