<script lang="ts">
    import type { DropdownOption } from "../obsidian/dropdownLinkModal.ts";

    export let title: string;
    export let options: DropdownOption[];
    let selectedOption = options[0];
    function goToLink() {
        if (selectedOption && selectedOption.url) {
            window.open(selectedOption.url, '_blank');
        }
    }
</script>

<h3>{title}</h3>

<select bind:value={selectedOption}>
    {#each options as option (option.url)}
        <option value={option}>{option.label}</option>
    {/each}
</select>
<br><br>
<button on:click={goToLink} class="mod-cta">Go to {selectedOption.label}</button>
