<script lang="ts">
    export let text: Promise<String>;
</script>

{#await text}
    Loading... <div class="spinner"></div>
{:then text} 
    <code>{text}</code>
{/await}

<style>
    .spinner {
        border: 4px solid #000000;
        border-top: 4px solid #ffffff;
        border-radius: 50%;
        width: 20px;
        height: 20px;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    code {
        user-select: text;
        word-wrap: break-word;
    }
</style>  