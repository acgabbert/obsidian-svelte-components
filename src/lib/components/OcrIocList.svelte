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
<div class="ocr-indicators-container">
    <div class="collapsible">
        <button class="header-button" on:click={toggleCollapse} aria-expanded={!isCollapsed}>
            <span>{isCollapsed ? "+" : "-"}</span> OCR Indicators
        </button>
        {#await indicators}
            <p>Loading...</p>
        {:then indicators}
            {#if !isCollapsed}
                <div class="ocr-content-container">
                    {#if hasIndicators(indicators)}
                        <div class="ocr-content" transition:slide>
                            {#each indicators as indicatorList}
                                {#if indicatorList.items.length > 0}
                                    <IocList {indicatorList}/>
                                {/if}
                            {/each}
                        </div>
                    {:else}
                        <i style="color: var(--text-muted);">No indicators found in attachment files.</i>
                    {/if}
                </div>
            {/if}
        {/await}
    </div>
</div>

<style>
    .ocr-indicators-container {
        margin-top: 1rem;
    }

    .ocr-content-container {
        display: flex;
        flex-direction: column;
    }
    
    .collapsible {
        display: flex;
        flex-direction: column;
    }

    .header-button {
        all: unset;
        cursor: pointer;
        font-size: var(--h4-size);
        font-weight: var(--h4-weight);
        margin-bottom: 0.5rem;
    }
</style>