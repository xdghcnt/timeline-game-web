import { ref } from 'vue';
import { processWrappedRequest, ReactAppWindow, requestWrap, SocketWrappedRequestResult } from './react-common';

const GAME_CHANNEL = '/bg/timeline';

interface TimelineState {
    teamsLocked: boolean;
    userId: string;
    inited: boolean;
}

declare const window: ReactAppWindow<TimelineState>;

export function useTimelineService() {
    const socket = window.socket.of(GAME_CHANNEL);
    return {
        toggleLock: () => socket.emit('toggle-lock'),
        setRoomMode: () => socket.emit('set-room-mode', false),
    };
}

let timelineState = ref(window.gameState || { inited: false });
let stateMaintained = false;

function maintainState() {
    if (!stateMaintained) {
        stateMaintained = true;
        window.socket.of(GAME_CHANNEL).on('state', (state: TimelineState) => {
            timelineState.value = {
                ...state,
                userId: window.gameApp.userId,
            };
        });
        window.socket.of(GAME_CHANNEL).on('request-result', (state: SocketWrappedRequestResult) => {
            processWrappedRequest(state);
        });
    }
}

export function useTimelineState() {
    maintainState();
    return timelineState;
}
