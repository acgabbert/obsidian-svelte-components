<!-- 
Update a collection of boolean values at once using checkboxes.
-->
<script lang="ts">
    import type { BooleanSetting } from "$lib/obsidian/settingCollectionModal.ts";
    import { createEventDispatcher } from "svelte";
    export let items: BooleanSetting[];
    export let title: string;

    const dispatch = createEventDispatcher();

    export function getValues(): BooleanSetting[] {
        return items;
    }

    function toggleCheckbox(item: BooleanSetting) {
        dispatch('change', item);
    }
</script>

<h3>{title}</h3>
<div>
    {#each items as item}
        <label>
            <input type="checkbox" bind:checked={item.value} on:change={() => toggleCheckbox(item)} />
            {item.displayName}
        </label>
    {/each}
</div>