<template>
  Карт: {{ packFull?.cards.length || '-' }}
  Название
    <InputText v-model="name" type="text" @blur="inputsChange()" />
    <label for="enabled">Включён</label>
    <Checkbox id="enabled" v-model="enabled" binary @change="inputsChange" />
</template>

<script lang="ts" setup>
    import { PackFull, PackID } from './index';
    import { ref, watch } from 'vue';
    import { useTimelineService } from '../service';
    import InputText from 'primevue/inputtext';
    import Checkbox from 'primevue/checkbox';

    const props = defineProps<{ packId?: PackID }>();
    const emit = defineEmits(['pack-updated']);

    const packFull = ref<PackFull | null>();
    const service = useTimelineService();

    const name = ref('');
    const enabled = ref(false);

    async function inputsChange() {
        await service.updatePack(props.packId!, name.value, enabled.value);
        emit('pack-updated');
    }

    watch(() => props.packId, async (packId) => {
        if (packId)
            packFull.value = await service.getPack(packId);
        if (packFull.value) {
            name.value = packFull.value.name;
            enabled.value = packFull.value.enabled;
        }
    });


</script>

<style scoped>
</style>
