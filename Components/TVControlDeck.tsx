import VideoPlug from './VideoPlug';
import LeftAudioPlug from './LeftAudioPlug';
import RightAudioPlug from './RightAudioPlug';
import PowerButton from './PowerButton';
import VolumeControl from './VolumeControl';
import ChannelControl from './ChannelControl';

export default function TVControlDeck() {
  return (
    <div className="TVControlDeck">
      <div className="plugs">
        {/* Here I will put the video and audio plugs, these are only visual components */}
        <VideoPlug />
        <LeftAudioPlug />
        <RightAudioPlug />
      </div>
      <div className="buttonGroup">
        {/* Here is where I will put the TV Buttons, 
        (stretch goal idea allow channel control to switch channels which corresponds to a shader.)
        */}

        <PowerButton />
        <VolumeControl />
        <ChannelControl />
      </div>
    </div>
  )
}
