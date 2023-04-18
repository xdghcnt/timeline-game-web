const fsPromises = require("fs/promises");

function init(wsServer, path, vkToken) {
    const
        fs = require("fs"),
        nedb = require("nedb-promises"),
        randomColor = require('randomcolor'),
        app = wsServer.app,
        registry = wsServer.users,
        channel = "timeline",
        testMode = process.argv[2] === "debug",
        PLAYERS_MIN = 1;

    const packsDB = nedb.create(`${registry.config.appDir}/timeline-packs.db`);
    const cardsDB = nedb.create(`${registry.config.appDir}/timeline-cards.db`);
    packsDB.persistence.setAutocompactionInterval(60000);
    cardsDB.persistence.setAutocompactionInterval(60000);

    app.use("/timeline", wsServer.static(`${__dirname}/dist`));
    registry.handleAppPage(path, `${__dirname}/dist/index.html`, `${__dirname}/dist/manifest.json`, '/timeline/');

    app.post("/timeline/upload-image", async (req, res) => {
        const publicDir = `${this.config.appDir}/public/user-data`;
        if (req.files && req.files.image && this.checkUserToken(req.body.userId, req.body.userToken)) {
            const size = req.files.image.size / 1024 / 1024;
            const authUser = await this.authUsers.getBySessionId(req.body.userToken);
            if (!authUser) {
                res.status(500).send("Wrong auth");
                return;
            }
            if (size >= 3)
                res.status(500).send("Size limit exceeded");
            if (res.finished) return;
            let imagePath;
            const id = +(new Date());
            const fullImagePath = `${publicDir}/timeline-cards/${id}.png`;
            req.files.image.mv(`${fullImagePath}_temp`, async (err) => {
                let wasError;
                if (err) {
                    this.log(`fileUpload mv error ${err}`);
                    return res.status(500).send("FAIL");
                } else {
                    try {
                        await fsPromises.rename(`${fullImagePath}_temp`, fullImagePath);
                        res.send({id});
                    } catch (error) {
                        this.log(`fileUpload detect error ${error}`);
                        wasError = true;
                        return res.status(500).send("FAIL");
                    }
                    if (wasError)
                        void fsPromises.rm(`${fullImagePath}_temp`);
                }
            });
        } else res.status(500).send("Wrong data");
    });

    const packs = {
        games: {
            title: 'Игры',
            scales: ['releaseDate', 'maxOnline'],
            cards: [
                {
                    id: 0,
                    title: 'Dota 2',
                    values: {
                        releaseDate: 2011,
                        maxOnline: 1240114,
                    },
                },
                {
                    id: 1,
                    title: 'CS 1.6',
                    values: {
                        releaseDate: 1998,
                        maxOnline: 1,
                    },
                },
                {
                    id: 3,
                    title: 'Undertale',
                    values: {
                        releaseDate: 2015,
                        maxOnline: 99999999,
                    },
                },
                {
                    id: 4,
                    title: 'TeamFortress2',
                    values: {
                        releaseDate: 2007,
                        maxOnline: 99999999999999,
                    },
                },
            ],
        },
    };

    class GameState extends wsServer.users.RoomState {
        constructor(hostId, hostData, userRegistry) {
            super(hostId, hostData, userRegistry, registry.games.timeline.id, path);
            const
                room = {
                    ...this.room,
                    inited: true,
                    hostId: hostId,
                    spectators: new JSONSet(),
                    playerNames: {},
                    playerColors: {},
                    onlinePlayers: new JSONSet(),
                    currentPlayer: null, // 'abcdf'
                    players: new JSONSet(),
                    inactivePlayers: new JSONSet(),
                    initialCardCount: 1,
                    teamsLocked: false,
                    timed: true,
                    playerWin: null,
                    deskCards: [],
                    phase: 0, // 0 1
                    turnTime: 30,
                    time: null,
                    paused: true,
                    playerAvatars: {},
                    managedVoice: true,
                    pack: 'games',
                    packScale: 'releaseDate',
                    deckSize: 0,
                    prevPlayer: null, //'abcd123',
                    prevSuccessCardIndex: null, //4,
                    prevTrashCardIndex: null, //4,
                    prevTrashCard: null, //{},
                    playerHands: {
                        // abcd123: [
                        //     {
                        //         id: '1233453465456456',
                        //         title: 'Название',
                        //     }
                        // ]
                    },
                    draftHandIndex: null,
                    draftDeskIndex: null,
                },
                state = {
                    playerHands: {},
                    deck: [],
                    discard: [],
                    firstDeskCard: null,
                },
                player = {};
            this.room = room;
            this.room = room;
            this.state = state;
            this.player = player;
            this.lastInteraction = new Date();
            let interval;
            const
                send = (target, event, data) => userRegistry.send(target, event, data),
                update = () => {
                    if (room.voiceEnabled)
                        processUserVoice();
                    send(room.onlinePlayers, "state", room);
                },
                processUserVoice = () => {
                    room.userVoice = {};
                    room.onlinePlayers.forEach((user) => {
                        if (!room.managedVoice || !room.teamsLocked || room.phase === 0 || room.players.has(user))
                            room.userVoice[user] = true;
                    });
                },
                processInactivity = (playerId) => {
                    if (room.inactivePlayers.has(playerId))
                        removePlayer(playerId);
                    else {
                        room.activePlayers.delete(playerId);
                        room.inactivePlayers.add(playerId);
                    }
                },
                startTimer = () => {
                    if (room.timed) {
                        clearInterval(interval);
                        if (room.phase === 1)
                            room.time = room.turnTime * 1000;
                        let time = new Date();
                        interval = setInterval(() => {
                            if (!room.paused) {
                                room.time -= new Date() - time;
                                time = new Date();
                                if (room.time <= 0) {
                                    clearInterval(interval);
                                    if (room.phase === 1) {
                                        const inactivePlayer = room.currentPlayer;
                                        endRound();
                                        processInactivity(inactivePlayer);
                                    }
                                    update();
                                }
                            } else time = new Date();
                        }, 100);
                    }
                },
                getNoValueCard = (card) => {
                    return {...card, value: undefined};
                },
                dealCard = (user) => {
                    if (state.deck.length === 0) {
                        state.deck = shuffleArray(state.discard);
                        state.discard = [];
                        room.prevTrashCard = null;
                    }
                    const newCard = state.deck.pop();
                    state.playerHands[user].push(newCard);
                    const newCardNoValues = getNoValueCard(newCard);
                    room.playerHands[user].push(newCardNoValues);
                    room.deckSize = state.deck.length;
                },
                dealInitialCards = () => {
                    const cardsToDeal = Math.min(Math.ceil((state.deck.length - 1) / room.players.size), room.initialCardCount);
                    for (const player of [...room.players]) {
                        let playerCardsToDeal = cardsToDeal;
                        while (playerCardsToDeal--) dealCard(player);
                    }
                },
                dealOnPlayerJoin = () => {
                    if (room.phase === 1) {
                        let cardsToDeal = room.initialCardCount;
                        while (cardsToDeal--) dealCard(player);
                    }
                },
                buildDeck = () => {
                    state.deck = shuffleArray(packs[room.pack].cards
                        .filter((it) => it.values[room.packScale] !== undefined)
                        .map((it) =>
                            ({...it, values: undefined, value: it.values[room.packScale]})));
                    state.discard = [];
                    room.deckSize = state.deck.length;
                },
                startGame = (pack, scale) => {
                    if (room.players.size >= PLAYERS_MIN && packIsPlayable(pack, scale)) {
                        room.pack = pack;
                        room.packScale = scale;
                        if (state.firstDeskCard)
                            state.discard.push(state.firstDeskCard);
                        else
                            state.discard.push(...room.deskCards);
                        for (const hand of Object.values(state.playerHands)) {
                            state.discard.push(...hand);
                        }
                        for (const player of Object.keys(room.playerHands)) {
                            delete room.playerHands[player];
                            delete state.playerHands[player];
                        }
                        for (const player of [...room.players]) {
                            room.playerHands[player] = [];
                            state.playerHands[player] = [];
                        }
                        if (!state.deck.length)
                            buildDeck();
                        room.playerWin = null;
                        room.deskCards = [];
                        room.phase = 1;
                        room.prevPlayer = null;
                        room.prevSuccessCardIndex = null;
                        room.prevTrashCardIndex = null;
                        room.prevTrashCard = null;
                        dealInitialCards();
                        state.firstDeskCard = state.deck.pop();
                        room.deskCards.push(getNoValueCard(state.firstDeskCard));
                        room.currentPlayer = [...room.players][0];
                        room.phase = 1;
                        startTimer();
                    } else {
                        room.paused = true;
                        room.teamsLocked = false;
                    }
                },
                endGame = () => {
                    room.paused = true;
                    room.teamsLocked = false;
                    room.time = null;
                    room.phase = 0;
                    clearInterval(interval);
                    update();
                },
                endRound = () => {
                    room.draftHandIndex = null;
                    room.draftDeskIndex = null;
                    const players = [...room.players];
                    if (players[players.length - 1] === room.currentPlayer) {
                        const playersNoCards = players.filter((it) => room.playerHands[it].length === 0);
                        if (playersNoCards.length === 1) {
                            room.playerWin = playersNoCards[0];
                            endGame();
                        } else {
                            if (playersNoCards.length > (state.deck.length + state.discard.length)) {
                                room.playerWin = shuffleArray(playersNoCards)[0]; // todo туду
                                sendDeckEmptyNotice();
                                endGame();
                            }
                            for (const player of playersNoCards)
                                dealCard(player);
                        }
                    } else {
                        const currentPlayerIndex = players.indexOf(room.currentPlayer);
                        if (currentPlayerIndex === player.length - 1)
                            room.currentPlayer = players[0];
                        else
                            room.currentPlayer = players[currentPlayerIndex + 1];
                        startTimer();
                    }
                    update();
                },
                removePlayer = (playerId) => {
                    if (room.players.size === 1) {
                        room.paused = true;
                        room.teamsLocked = false;
                    } else if (room.currentPlayer === playerId) {
                        endRound();
                    }
                    room.players.delete(playerId);
                    if (room.spectators.has(playerId) || !room.onlinePlayers.has(playerId)) {
                        room.spectators.delete(playerId);
                        delete room.playerNames[playerId];
                        this.emit("user-kicked", playerId);
                    } else
                        room.spectators.add(playerId);
                },
                sendDeckEmptyNotice = () => {
                    send(room.onlinePlayers, 'deck-empty-message');
                },
                userJoin = (data) => {
                    const user = data.userId;
                    if (!room.playerNames[user]) {
                        room.spectators.add(user);
                    }
                    room.playerColors[user] = room.playerColors[user] || randomColor();
                    room.onlinePlayers.add(user);
                    room.playerNames[user] = data.userName.substr && data.userName.substr(0, 60);
                    if (data.avatarId) {
                        fs.stat(`${registry.config.appDir || __dirname}/public/avatars/${user}/${data.avatarId}.png`, (err) => {
                            if (!err) {
                                room.playerAvatars[user] = data.avatarId;
                                update();
                            }
                        });
                    }
                    update();
                },
                userLeft = (user) => {
                    room.onlinePlayers.delete(user);
                    if (room.spectators.has(user))
                        delete room.playerNames[user];
                    room.spectators.delete(user);
                    if (room.onlinePlayers.size === 0)
                        clearInterval(interval);
                    update();
                },
                userEvent = async (user, event, data) => {
                    this.lastInteraction = new Date();
                    try {
                        if (this.eventHandlers[event])
                            return this.eventHandlers[event](user, data[0], data[1], data[2]);
                        if (this.eventRequestHandlers[event]) {
                            const result = await this.eventRequestHandlers[event](user, data[1], data[2]);
                            send(user, 'request-result', {
                                data: result,
                                id: data[0],
                            });
                        }
                    } catch (error) {
                        console.error(error);
                        registry.log(error.message);
                    }
                },
                gameIsJoinable = () => {
                    if (room.phase === 0) return true;
                    if ((state.deck.length + state.discard.length) >= room.initialCardCount)
                        return true;
                    else
                        sendDeckEmptyNotice();
                },
                packIsPlayable = (pack, scale) => {
                    return packs[pack] && packs[pack].scales.includes(scale)
                        && packs[pack].cards.filter((it) => it.values[scale] !== undefined).length > room.players.size - 1;
                },
                getPack = async (user, id) => {
                    const authUser = room.authUsers[user]?._id;
                    if (authUser) {
                        const pack = await packsDB.findOne({_id: id});
                        if (pack?.owner === authUser)
                            return pack;
                    }
                },
                getCard = async (user, id) => {
                    const authUser = room.authUsers[user]?._id;
                    if (authUser) {
                        const card = await cardDB.findOne({_id: id});
                        const pack = await packsDB.findOne({_id: card.pack});
                        if (pack?.owner === authUser)
                            return card;
                    }
                };
            this.updatePublicState = update;
            this.userJoin = userJoin;
            this.userLeft = userLeft;
            this.userEvent = userEvent;
            this.eventHandlers = {
                ...this.eventHandlers,
                "update-avatar": (user, id) => {
                    room.playerAvatars[user] = id;
                    update();
                },
                "toggle-lock": (user) => {
                    if (user === room.hostId)
                        room.teamsLocked = !room.teamsLocked;
                    update();
                },
                "toggle-pause": (user, pack, scale) => {
                    if (room.hostId === user) {
                        if (room.phase === 0) {
                            startGame(pack, scale);
                        } else {
                            if (user === room.hostId && room.players.size > 0)
                                room.paused = !room.paused;
                            if (room.timeUpdated) {
                                room.timeUpdated = false;
                                startTimer();
                            }
                        }
                        update();
                    }
                },
                "restart": (user) => {
                    if (user === room.hostId) {
                        startGame();
                    }
                    update();
                },
                "toggle-timed": (user) => {
                    if (user === room.hostId) {
                        room.timed = !room.timed;
                        if (!room.timed) {
                            room.time = null;
                            clearInterval(interval);
                        }
                    }
                    update();
                },
                "set-time": (user, type, value) => {
                    if (user === room.hostId && ~["turnTime"].indexOf(type) && !isNaN(parseInt(value))) {
                        room[type] = parseFloat(value);
                        room.timeUpdated = true;
                    }
                    update();
                },
                "remove-player": (user, playerId) => {
                    if (playerId && user === room.hostId)
                        removePlayer(playerId);
                    update();
                },
                "give-host": (user, playerId) => {
                    if (playerId && user === room.hostId) {
                        room.hostId = playerId;
                        this.emit("host-changed", user, playerId);
                    }
                    update();
                },
                "players-join": (user) => {
                    if (!room.teamsLocked && gameIsJoinable()) {
                        room.spectators.delete(user);
                        room.players.add(user);
                        room.inactivePlayers.delete(user);
                        if (room.players.size === 1)
                            room.currentPlayer = user;
                        dealOnPlayerJoin();
                        update();
                    }
                },
                "spectators-join": (user) => {
                    if (!room.teamsLocked) {
                        removePlayer(user);
                        update();
                    }
                },
                "set-draft-card": (user, handIndex, deskIndex) => {
                    if (room.currentPlayer === user && (state.playerHands[user][handIndex] || handIndex === null)
                        && ((room.deskCards[deskIndex] || room.deskCards[deskIndex - 1]) || deskIndex === null)) {
                        room.draftDeskIndex = deskIndex;
                        room.draftHandIndex = handIndex;
                        update();
                    }
                },
                "play-card": (user, handIndex, deskIndex) => {
                    if (room.currentPlayer === user && state.playerHands[user][handIndex]
                        && (room.deskCards[deskIndex] || room.deskCards[deskIndex - 1])) {
                        const card = state.playerHands[user][handIndex];
                        const prevCard = room.deskCards[deskIndex - 1];
                        const nextCard = room.deskCards[deskIndex];
                        if (state.firstDeskCard) {
                            room.deskCards = [state.firstDeskCard];
                            state.firstDeskCard = null;
                        }
                        if ((!prevCard || prevCard.value <= card.value) && (!nextCard || nextCard.value >= card.value)) {
                            room.deskCards.splice(deskIndex, 0, card);
                            room.prevSuccessCardIndex = deskIndex;
                            room.prevTrashCardIndex = null;
                        } else {
                            state.discard.push(state.playerHands[user]);
                            room.prevSuccessCardIndex = null;
                            room.prevTrashCardIndex = deskIndex;
                            if (state.deck.length > 0 || state.discard.length > 0) {
                                room.prevTrashCard = card;
                                dealCard(user);
                            }
                        }
                        state.playerHands[user].splice(handIndex, 1);
                        room.playerHands[user].splice(handIndex, 1);
                        room.prevPlayer = user;
                        endRound();
                    }
                },
            };
            this.eventRequestHandlers = {
                "create-pack": async (user) => {
                    const authUser = room.authUsers[user]?._id;
                    if (authUser) {
                        const packId = +(new Date());
                        const scaleId = +(new Date());
                        const cardId = +(new Date());
                        await packsDB.insert({
                            _id: packId,
                            name: 'Новый пак',
                            scaleNames: {
                                [scaleId]: 'Шкала 1',
                            },
                            scales: [scaleId],
                            enabled: false,
                            ownerId: authUser,
                        });
                        await cardsDB.insert({
                            _id: cardId,
                            title: 'Карта 1',
                            values: {
                                [scaleId]: 0,
                            },
                            image: null,
                            packId,
                        });
                        send(user, 'pack-created', packId);
                    }
                },
                "update-pack": async (user, packId, name, enabled) => {
                    const pack = await getPack(packId);
                    if (pack && typeof enabled === 'boolean') {
                        pack.name = name;
                        pack.enabled = enabled;
                        await cardsDB.update({packId}, pack);
                        send(user, 'pack-updated');
                    }
                },
                'remove-pack': async (user, packId) => {
                    const pack = await getPack(user, packId);
                    if (pack) {
                        await packsDB.remove({_id: packId});
                        await cardsDB.remove({packId}, {multi: true});
                        send(user, 'pack-removed');
                    }
                },
                "add-scale": async (user, packId, scaleName) => {
                    const pack = await getPack(user, packId);
                    if (pack) {
                        const scaleId = +(new Date());
                        pack.scales.push(scaleId);
                        pack.scaleNames[scaleId] = scaleName;
                        send(user, 'scale-created', scaleId);
                    }
                },
                "update-scale": async (user, packId, scaleId, scaleName) => {
                    const pack = await getPack(user, packId);
                    if (pack) {
                        pack.scales[scaleId] = scaleName;
                        send(user, 'scale-updated');
                    }
                },
                "remove-scale": async (user, packId, scaleId) => {
                    const pack = await getPack(user, packId);
                    if (pack) {
                        pack.scales.splice(pack.scales.indexOf(scaleId), 1);
                        delete pack.scaleNames[scaleId];
                        await cardsDB.update({packId}, {$unset: {[`values.${scaleId}`]: 1}}, {multi: true});
                        send(user, 'scale-removed');
                    }
                },
                "add-card": async (user, packId) => {
                    const pack = await getPack(user, packId);
                    if (pack) {
                        const cardId = +(new Date());
                        const values = {};
                        pack.scales.forEach((scaleId) => {
                            values[scaleId] = 0;
                        });
                        await cardsDB.insert({
                            _id: cardId,
                            title: 'Новая карта',
                            values,
                            packId,
                            image: null,
                        });
                        send(user, 'card-created', cardId);
                    }
                },
                "update-card": async (user, cardId, title, values, image) => {
                    const card = await getCard(user, cardId);
                    if (card) {
                        const pack = await getPack(user, card.packId);
                        if (Object.keys(values).every((it) => pack.scales.includes(it) && (!isNaN(values[it]) || values[it] === null))) {
                            card.title = title;
                            card.values = values;
                            card.image = image;
                            await cardsDB.update({_id: cardId}, card);
                            send(user, 'card-updated');
                        }
                    }
                },
                "update-image": async (user, cardId, title, values) => {
                    const card = await getCard(user, cardId);
                    if (card) {
                        const pack = await getPack(user, card.packId);
                        if (Object.keys(values).every((it) => pack.scales.includes(it) && (!isNaN(values[it]) || values[it] === null))) {
                            card.title = title;
                            card.values = values;
                            await cardsDB.update({_id: cardId}, card);
                            send(user, 'card-updated');
                        }
                    }
                },
                "remove-card": async (user, cardId) => {
                    const card = await getCard(user, cardId);
                    if (card) {
                        await cardsDB.remove({_id: cardId});
                        send(user, 'card-removed');
                    }
                },
                "pack-list": async (user) => {
                    send(user, 'pack-list', await packsDB.find({enabled: true}));
                },
                "owned-pack-list": async (user) => {
                    send(user, 'owned-pack-list', await packsDB.find({ownerId: room.authUsers[user]?._id}));
                },
                "get-pack": async (user, packId) => {
                    const pack = await packsDB.findOne({_id: packId});
                    if (pack) {
                        const packExtended = {...pack};
                        packExtended.cards = (await cardsDB.find({packId})).map((it) => ({
                            ...it,
                            values: pack.ownerId === room.authUsers[user]?._id ? it.values : undefined,
                        }));
                        packExtended.ownerName = (await registry.authUsers.getUsersMiniProfiles([pack.ownerId]))[0];
                        send(user, 'pack', packExtended);
                    }
                },
            };
        }

        getPlayerCount() {
            return Object.keys(this.room.playerNames).length;
        }

        getActivePlayerCount() {
            return this.room.onlinePlayers.size;
        }

        getLastInteraction() {
            return this.lastInteraction;
        }

        getSnapshot() {
            return {
                room: this.room,
                state: this.state,
            };
        }

        setSnapshot(snapshot) {
            Object.assign(this.room, snapshot.room);
            Object.assign(this.state, snapshot.state);
            Object.assign(this.player, snapshot.player);
            Object.keys(this.player).forEach((id) => {
                this.player[id].keepCards = new JSONSet(this.player[id].keepCards);
            });
            this.room.paused = true;
            this.room.inactivePlayers = new JSONSet(this.room.inactivePlayers);
            this.room.onlinePlayers = new JSONSet();
            this.room.spectators = new JSONSet();
            this.room.players = new JSONSet(this.room.players);
            this.room.onlinePlayers.clear();
        }
    }

    function makeId() {
        let text = "";
        const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

        for (let i = 0; i < 5; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }

    function shuffleArray(array) {
        let currentIndex = array.length, temporaryValue, randomIndex;
        while (0 !== currentIndex) {
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }
        return array;
    }

    function getRandomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    class JSONSet extends Set {
        constructor(iterable) {
            super(iterable);
        }

        toJSON() {
            return [...this];
        }
    }

    registry.createRoomManager(path, GameState);
}

module.exports = init;

