import ActionButtons from "./ActionButtons";
import DPad from "./D-pad";

export default function GamePad() {
  // This the start of the Mobile version of swDOOM
  return (
    <div className="gamePad">
      <DPad />
      <ActionButtons />
    </div>
  )
}
