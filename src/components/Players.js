import React from 'react';
import PlayerItem from './PlayerItem';

const Players = (props) => (
    <div className="player">
        {
            props.players.length === 0 ? "Use the room code above to join."
                : props.players.map((player) => {
                    return <PlayerItem key={player.name} name={player.name} score={player.score} stroke={player.stroke} colour={player.colour} />
                })
        }
    </div>
)

export default Players
