<script lang="ts">
	import type { ParsedIndicators } from "obsidian-cyber-utils";
    import { IocList } from "obsidian-svelte-components";
	import { slide } from "svelte/transition";
    export let indicators: ParsedIndicators[];
    let isCollapsed = false;
    function toggleCollapse() {
        isCollapsed = !isCollapsed;
    }
</script>

<div class="collapsible">
    <button class="header-button" on:click={toggleCollapse} aria-expanded={!isCollapsed}>
        <span>{isCollapsed ? '+' : '−'}</span> OCR Indicators
    </button>
    {#if !isCollapsed}
        <div class="ocr-content" transition:slide>
            {#each indicators as indicatorList}
                {#if indicatorList.items.length > 0}
                    <IocList indicatorList={indicatorList}/>
                {/if}
            {/each}
        </div>
    {/if}
</div>
    
<style>
    .collapsible {
        overflow: hidden;
    }

    .header-button {
        cursor: pointer;
        all: unset;
        font-size: var(--h4-size);
        font-weight: var(--h4-weight);
    }
</style>