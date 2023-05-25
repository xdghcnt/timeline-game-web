<template>
    <Dialog v-model:visible="visible" modal :draggable="false" :style="{ width: '80vw' }" content-class="h-screen">
        <div class="flex h-full gap-4">
            <Listbox v-model="selectedPack" :options="packs" option-label="name" option-value="_id"
                     class="w-15rem" list-style="max-height: 100%" />
            <PackEditor :pack-id="selectedPack" @pack-updated="loadPacks()" />
        </div>
        <template #header>
            <div class="flex align-items-center gap-4">
                <div class="p-dialog-title">Библиотека паков</div>
                <Button label="Создать" icon="pi pi-plus" @click="createPack()" size="small" />
            </div>
        </template>
    </Dialog>
</template>

<script lang="ts" setup>
    import { Pack, PackID, PackLibraryRef } from './index';
    import Dialog from 'primevue/dialog';
    import Listbox from 'primevue/listbox';
    import Button from 'primevue/button';
    import { ref, watch } from 'vue';
    import { useTimelineService } from '../service';
    import PackEditor from './PackEditor.vue';

    const visible = ref(false);
    const packs = ref<Pack[]>([]);
    const selectedPack = ref<PackID>();

    watch(selectedPack, (value, oldValue) => {
        if (!value)
            selectedPack.value = oldValue;
    });

    const service = useTimelineService();

    async function loadPacks() {
        packs.value = await service.listPacks();
        console.log(packs.value);
    }

    async function createPack() {
        const createdId = await service.createPack();
        await loadPacks();
        selectedPack.value = createdId;
    }

    defineExpose<PackLibraryRef>({
        open: async () => {
            visible.value = true;
            await loadPacks();
            selectedPack.value = packs.value[0]?._id;
        },
    });

</script>

<style scoped>
</style>
