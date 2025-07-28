import ControlButton from "./ControlButton"

export default function VolumeControl() {
  return (
    <div className="controlDeckWrapper">
      <div className="controlDeck">
        <ControlButton symbol="+" />
        <ControlButton symbol="-" />
      </div>
      <span className="buttonLabel">VOLUME</span>
    </div>
  )
}
