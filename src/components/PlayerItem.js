import React from 'react';
import { connect } from 'react-redux';
import RubberBand from 'react-reveal/RubberBand';


export const PlayerItem = (props) => (

    <RubberBand>
        <div className="player__items">
            {props.isPlaying ?
                 <div className="player_square dead_player"> </div>
             :
                 <div className="player_square living_player"> </div>
            }
        </div>
    </RubberBand>

)

export default PlayerItem;

/*

{
type: 'ADD_PLAYER',
player: {name:"anushan", colour:"red"}
}

*/
