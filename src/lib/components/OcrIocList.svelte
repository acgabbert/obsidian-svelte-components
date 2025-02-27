<script lang="ts">
    import type { ParsedIndicators } from "obsidian-cyber-utils";
    import IocList from "./IocList.svelte";
    import { slide } from "svelte/transition";
    export let indicators: Promise<ParsedIndicators[]> | ParsedIndicators[];
    export let isLoading: boolean = false;
    export let progressStats: {total: number, completed: number} = {total: 0, completed: 0};
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
            {#if isLoading}
                <span class="loading-indicator"></span>
                {#if progressStats.total > 0}
                    <span class="progress-text">({progressStats.completed}/{progressStats.total})</span>
                {/if}
            {/if}
        </button>
        
        {#if !isCollapsed}
            <div class="ocr-content-container">
                {#if indicators instanceof Promise}
                    {#await indicators}
                        <p>Loading initial results...</p>
                    {:then resolvedIndicators}
                        {#if hasIndicators(resolvedIndicators)}
                            <div class="ocr-content" transition:slide>
                                {#each resolvedIndicators as indicatorList}
                                    {#if indicatorList.items.length > 0}
                                        <IocList {indicatorList}/>
                                    {/if}
                                {/each}
                            </div>
                        {:else}
                            <i style="color: var(--text-muted);">No indicators found in attachment files.</i>
                        {/if}
                    {/await}
                {:else}
                    {#if hasIndicators(indicators)}
                        <div class="ocr-content" transition:slide>
                            {#each indicators as indicatorList}
                                {#if indicatorList.items.length > 0}
                                    <IocList {indicatorList}/>
                                {/if}
                            {/each}
                        </div>
                    {:else}
                        <i style="color: var(--text-muted);">No indicators found in attachment files{#if isLoading} yet{/if}.</i>
                    {/if}
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
    
    .progress-text {
        font-size: 0.8em;
        margin-left: 5px;
        opacity: 0.8;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
</style>