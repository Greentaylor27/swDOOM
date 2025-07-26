import VideoPlug from './VideoPlug';
import AudioPlugs from './AudioPlug';

export default function TVControlDeck() {
  return (
    <div className="TVControlDeck">
      <div className="plugs">
        {/* Here I will put the video and audio plugs */}
        <VideoPlug />
        <AudioPlugs />
      </div>
      <div className="buttonGroup">
        {/* Here is where I will put the TV Buttons */}
        {/* <PowerButton /> */}
        {/* <VolumeControl /> */}
        {/* <ChannelControl /> */}
      </div>
    </div>
  )
}
