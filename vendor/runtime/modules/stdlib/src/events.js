import { Platform } from "./expose/Platform.js";
import { BehaviorSubject } from "../modules/stdlib/vendor/rxjs.js";
import "../deps.js";
import { UpdateTitlebarSubject } from "./events.mix.js";
//#region modules/stdlib/src/events.ts
const newEventBus = () => {
	const PlayerAPI = Platform.getPlayerAPI();
	const History = Platform.getHistory();
	const playerState = PlayerAPI.getState();
	return {
		Player: {
			state_updated: new BehaviorSubject(playerState),
			status_changed: new BehaviorSubject(playerState),
			song_changed: new BehaviorSubject(playerState)
		},
		History: { updated: new BehaviorSubject(History.location) },
		ControlMessage: { titlebar_updated: new BehaviorSubject(-1) }
	};
};
const EventBus = newEventBus();
let cachedState = {};
const playerListener = ({ data: state }) => {
	EventBus.Player.state_updated.next(state);
	if (state?.item?.uri !== cachedState?.item?.uri) EventBus.Player.song_changed.next(state);
	if (state?.isPaused !== cachedState?.isPaused || state?.isBuffering !== cachedState?.isBuffering) EventBus.Player.status_changed.next(state);
	cachedState = state;
};
const historyListener = (location) => EventBus.History.updated.next(location);
const updateTitlebarListener = (height) => EventBus.ControlMessage.titlebar_updated.next(height);
function startEventHandlers() {
	const cancelPlayerListener = Platform.getPlayerAPI().getEvents().addListener("update", playerListener);
	const cancelHistoryListener = Platform.getHistory().listen(historyListener);
	const updateTitlebarListenerSubscription = UpdateTitlebarSubject.subscribe(updateTitlebarListener);
	return () => {
		cancelPlayerListener();
		cancelHistoryListener();
		updateTitlebarListenerSubscription.unsubscribe();
	};
}
//#endregion
export { startEventHandlers };

//# sourceMappingURL=events.js.map