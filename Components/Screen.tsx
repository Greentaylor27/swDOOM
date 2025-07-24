export default function Screen() {
  {/* the canvas will go here */}
  return (
    <div>
	<canvas id="canvas" oncontextmenu="event.preventDefault()"></canvas>
	<script type='text/javascript'>
		 var Module = {
		 	canvas: (function() {return document.getElementById('canvas'); })()
		 };
	</script>

	<script src="index.js"></script> <!-- TODO: fix this line -->
    </div>
  )
}
