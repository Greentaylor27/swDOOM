type VolumeButtonProps = {
  symbol: string;
}

export default function ControlButton({ symbol }: VolumeButtonProps) {
  return (
    <button className="controlButton">
      <span className ="volumeIcon">{symbol}</span>
    </button>
  )
}
