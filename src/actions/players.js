
export const addPlayer = (player) => ({
    type: "ADD_PLAYER",
    player
});

export const removePlayer = (name) => ({
    type: "REMOVE_PLAYER",
    name
});