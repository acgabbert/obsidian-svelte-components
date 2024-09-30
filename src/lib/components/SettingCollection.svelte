<!-- 
Update a collection of boolean values at once using checkboxes.
-->
<script lang="ts">
    import { createEventDispatcher } from "svelte";
    export let items: string[] = [];
    export let defaultValues: boolean[] = [];

    // Initialize checkbox states with default values or false if not provided
    let checkboxes: boolean[] = defaultValues.length ? [...defaultValues] : Array(items.length).fill(false);

    const dispatch = createEventDispatcher();

    export function getValues(): boolean[] {
        return checkboxes;
    }

    function toggleCheckbox(index: number) {
        dispatch('change', {index, value: checkboxes[index], allValues: checkboxes});
    }
</script>

<div>
    {#each items as item, index}
        <label>
            <input type="checkbox" bind:checked={checkboxes[index]} on:change={() => toggleCheckbox(index)} />
            {item}
        </label>
    {/each}
</div>