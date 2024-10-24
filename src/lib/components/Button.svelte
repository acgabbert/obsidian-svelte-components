<script lang="ts">
    export let title: string;
    export let href: string;
</script>

<a {href}>
	<button>{title}</button>
</a>

<style>
	button {
		transform: scale(0.8, 0.8);
	}
</style>