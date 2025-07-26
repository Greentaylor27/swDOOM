import VideoPlug from './VideoPlug';
import LeftAudioPlug from './LeftAudioPlug';
import RightAudioPlug from './RightAudioPlug';

export default function TVControlDeck() {
  return (
    <div className="TVControlDeck">
      <div className="plugs">
        {/* Here I will put the video and audio plugs */}
        <VideoPlug />
        <LeftAudioPlug />
        <RightAudioPlug />
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
