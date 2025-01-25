<script>
    import { slide } from "svelte/transition";

    export let title = "";
    export let isOpen = false;
</script>

<div class="collapsible">
    <button class="header" on:click={() => isOpen = !isOpen} aria-expanded={isOpen}>
        <span class="icon">{isOpen ? "-" : "+"}</span> {title}
    </button>
    {#if isOpen}
        <div class="content" transition:slide>
            <slot/>
        </div>
    {/if}
</div>

<style>
    .collapsible {
        display: flex;
        flex-direction: column;
    }

    .header {
        all: unset;
        cursor: pointer;
        font-size: var(--h4-size);
        font-weight: var(--h4-weight);
        margin-bottom: 0.5rem;
    }
</style>