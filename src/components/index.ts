export interface PackLibraryRef {
    open(): Promise<void>;
}

export type PackID = string;
export type CardID = string;
export type UserID = string;
export type ScaleID = string;

export interface Pack {
    _id: PackID;
    name: string;
    enabled: boolean;
    ownerId: UserID;
}

export interface PackFull extends Pack {
    scaleNames: Record<ScaleID, string>;
    scales: string[];
    cards: Card[];
    ownerMiniProfile: { avatar: string; name: string; };

}

export interface Card {
    _id: CardID;
    title: string;
    values: Record<ScaleID, number>;
    image: null | string;
    packId: PackID;
}
