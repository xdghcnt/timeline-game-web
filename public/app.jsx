//import React from "react";
//import ReactDOM from "react-dom"
//import io from "socket.io"
function makeId() {
    let text = "";
    const possible = "abcdefghijklmnopqrstuvwxyz0123456789";

    for (let i = 0; i < 5; i++)
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}


class Game extends React.Component {
    componentDidMount() {
        this.gameName = "timeline";
        const initArgs = CommonRoom.roomInit(this);
        this.socket.on("state", state => {
            CommonRoom.processCommonRoom(state, this.state, {
                maxPlayers: "∞",
                largeImageKey: "timeline",
                details: "timeline/Мемоджинариум",
            }, this);
            this.setState(state);
        });
        this.socket.on("message", text => {
            popup.alert({content: text});
        });
        window.socket.on("disconnect", (event) => {
            this.setState({
                inited: false,
                disconnected: true,
                disconnectReason: event.reason,
            });
        });
        this.socket.on("reload", () => {
            setTimeout(() => window.location.reload(), 3000);
        });
        this.socket.on("prompt-delete-prev-room", (roomList) => {
            if (localStorage.acceptDelete =
                prompt(`Limit for hosting rooms per IP was reached: ${roomList.join(", ")}. Delete one of rooms?`, roomList[0]))
                location.reload();
        });
        this.socket.on("ping", (id) => {
            this.socket.emit("pong", id);
        });
        document.title = `timeline - ${initArgs.roomId}`;
        this.socket.emit("init", initArgs);
    }

    constructor() {
        super();
        this.state = {
            inited: false,
        };
    }

    render() {
        if (this.state.disconnected)
            return (<div
                className="kicked">Disconnected{this.state.disconnectReason ? ` (${this.state.disconnectReason})` : ""}</div>);
        else if (this.state.inited) {
            return (
                <div className="game">
                    <CommonRoom state={this.state} app={this} />
                </div>
            );
        } else return (<div />);
    }
}

ReactDOM.render(<Game />, document.getElementById('root'));
