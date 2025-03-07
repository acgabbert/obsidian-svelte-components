<script lang="ts">
    import type { ParsedIndicators } from "obsidian-cyber-utils";
    import IocList from "./IocList.svelte";
    import { slide } from "svelte/transition";
    import type { ProgressStats } from "$lib/obsidian/ocrSidebar";
    export let indicators: ParsedIndicators[] | null;
    export let isBusy: boolean = false;
    export let progress: ProgressStats = {
        percentage: 0,
        completedTasks: 0,
        totalTasks: 0
    }
    let isCollapsed = false;
    
    function toggleCollapse() {
        isCollapsed = !isCollapsed;
    }

    $: hasIndicators = indicators?.some(list => list.items.length > 0);
</script>

<div class="ocr-indicators-container">
    <div class="collapsible">
        <button class="header-button" on:click={toggleCollapse} aria-expanded={!isCollapsed}>
            <span>{isCollapsed ? "+" : "-"}</span> OCR Indicators 
            {#if isBusy}
                <span class="loading-indicator"></span>
                <span class="processing-indicator">{progress.completedTasks}/{progress.totalTasks}</span>
            {/if}
        </button>
        {#if isBusy}
            <div class="progress-container">
                <div class="progress-bar" style="width: {progress.percentage}%"></div>
            </div>
        {/if}
        {#if !isCollapsed}
            <div class="ocr-content-container">
                {#if hasIndicators && indicators}
                    <div class="ocr-content" transition:slide>
                        {#each indicators as indicatorList}
                            {#if indicatorList.items.length > 0}
                                <IocList {indicatorList}/>
                            {/if}
                        {/each}
                    </div>
                {:else}
                    <i style="color: var(--text-muted);">{
                        progress.totalTasks > 0 ? 
                            'No indicators found in attachment files yet.'
                            : 'No attachment files found for processing.'}</i>
                {/if}
            </div>
        {/if}
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
    
    .loading-indicator {
        display: inline-block;
        width: 10px;
        height: 10px;
        margin-left: 8px;
        border: 2px solid var(--text-normal);
        border-top: 2px solid var(--background-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>