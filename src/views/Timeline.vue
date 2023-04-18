<template>
    <div class="pre-wrap text-left fixed top-0 left-0 mt-5 ml-3 text-xs">
        {{ state }}
    </div>
    <DashMenu :bottom-buttons="bottomButtons" :number-settings="numberSettings" />
</template>

<script setup lang="ts">
    import DashMenu from '../components/common/DashMenu.vue';
    import { DashMenuButton, DashMenuNumberSetting } from '../components/common/dash-menu';
    import { useTimelineService, useTimelineState } from '../service';
    import { computed } from 'vue';

    defineProps();

    const state = useTimelineState();
    const service = useTimelineService();

    const bottomButtons = computed<DashMenuButton[]>(() => {
        return [
            {
                icon: 'store',
                onClick: () => {
                    service.setRoomMode();
                },
            },
            {
                icon: state.value.teamsLocked ? 'lock_outline' : 'lock_open',
                onClick: async () => {
                    service.toggleLock();
                },
            },
        ];
    });

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
