<script lang="ts">
    import type { ParsedIndicators } from "obsidian-cyber-utils";
    import IocList from "./IocList.svelte";
    import { slide } from "svelte/transition";
    export let indicators: Promise<ParsedIndicators[]> | ParsedIndicators[];
    export let progress = {
        percentage: 0,
        isBusy: false,
        completedTasks: 0,
        totalTasks: 0
    }
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
            {#if progress.isBusy}
                <span class="processing-indicator">{progress.completedTasks}/{progress.totalTasks}</span>
            {/if}
        </button>

        {#await indicators}
            {#if progress.isBusy}
                <div class="progress-container">
                    <div class="progress-bar" style="width: {progress.percentage}%"></div>
                </div>
            {:else}
                <p>Loading...</p>
            {/if}
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

    .processing-indicator {
        font-size: var(--font-small);
        color: var(--text-muted);
        font-weight: normal;
        margin-left: 8px;
    }

    .progress-container {
        width: 100%;
        height: 4px;
        background-color: var(--background-modifier-border);
        border-radius: 2px;
        margin-bottom: 8px;
        overflow: hidden;
    }

    .progress-bar {
        height: 100%;
        background-color: var(--interactive-accent);
        transition: width 0.3s ease;
    }
</style>