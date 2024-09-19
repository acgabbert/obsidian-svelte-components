<script lang="ts">
	import type { ParsedIndicators } from "obsidian-cyber-utils";
    import IocList from "./IocList.svelte";
    //export let iocList: string[];
    export let indicators: ParsedIndicators[];
</script>

<h4>Extracted Indicators</h4>
{#each indicators as indicatorList}
    {#if indicatorList.items.length > 0}
        <IocList indicatorList={indicatorList}/>
    {/if}
{/each}