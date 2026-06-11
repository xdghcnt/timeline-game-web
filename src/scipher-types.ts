export type UserID = string;
export type TeamID = string;

export interface Team {
	score: number;
	players: Set<UserID>;
	currentPlayer?: UserID;
}

export interface TeamSettings {
	name: string;
	color: string;
	avatar?: string;
}

export interface ScipherSettings {
	wordsLevelSettings: [number, number, number, number];
	turnTime: number;
	turnGoal: number;
}

export interface TableWord {
	word: string;
	value: number;
	guessed: boolean;
	halfGuessed: boolean
}

export interface ScipherRoom {
	playerNames: Record<UserID, string>;
	players: Set<UserID>;
	currentTime: number;
	spectators: Set<UserID>;
	playersLocked: boolean;
	teams: Record<TeamID, Team>;
	currentTeam?: TeamID;
	wordGuesses: Record<UserID, string[]>;
	wordGuessing: Record<UserID, string>;
	wordGuessed: string[];
	wordHalfGuessed: string[];
	playerScore: Record<UserID, number>;
	settings: ScipherSettings;
	currentTurn: number;
	phase: 'idle' | 'game' | 'after-game';
	roomStyle: string;
	words?: TableWord[];
}

export interface ScipherState {
	words: TableWord[];
}

export interface ScipherService {
	toggleLock(): void;

	joinTeam(id: TeamID): void;

	updateSettings(data: ScipherSettings): void;

	joinSpectators(): void;

	updateTeamSettings(settings: TeamSettings): void;

	addCommand(): void;

	removeCommand(): void;

	startGame(): void;

	abortGame(): void;

	endAfterGame(): void;

	giveTurn(user: UserID): void;

	sendGuessTyping(word: string): void;

	sendGuess(word: string): void;

	endGame(): void;
}
