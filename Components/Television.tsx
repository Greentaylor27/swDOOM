import Screen from "./Screen"
import TVControlDeck from "./TVControlDeck"



export default function Television() {
  return (
    <div className="television">
      {/* here we will render the television components */}
      <Screen />
      
      {/* here is the Tv control deck */}
      <TVControlDeck />
    </div>
  )
}
