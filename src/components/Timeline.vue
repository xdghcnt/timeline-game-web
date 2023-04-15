<template>
    <DashMenu :bottom-buttons="bottomButtons" :number-settings="numberSettings">
        mnda
    </DashMenu>
</template>

<script setup lang="ts">
    import DashMenu from './common/DashMenu.vue';
    import { DashMenuButton, DashMenuNumberSetting } from './common/dash-menu';

    defineProps();

    const bottomButtons: DashMenuButton[] = [
        {
            icon: 'home',
            onClick: () => {
                console.log('home');
            },
        },
        {
            icon: 'wb_sunny',
            onClick: () => {
                console.log('wb_sunny');
            },
        },
    ];

    const numberSettings: DashMenuNumberSetting[] = [
        {
            icon: 'wb_sunny',
            originalValue: 1,
            onChange: (v) => {
                console.log('wb_sunny', v);
            },
        },
    ];

</script>

<style>
    body {
        background-color: var(--surface-ground) !important;
        color: var(--text-color);
    }
</style>
