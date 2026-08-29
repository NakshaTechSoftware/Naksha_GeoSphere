"use client";

import { useEffect, useRef } from "react";

interface PixelFaceProps {
  size?: number;
  speaking?: boolean;
}


type Pixel = {
  x: number;
  y: number;
};


// ==========================
// SETTINGS
// ==========================

const PIXEL_COLOR = "#FFFFFF";

const PIXEL_SIZE = 5;


// ==========================
// EYE SPRITE FRAMES
// ==========================


// Frame 1
//
//      [ ]
//
// [ ]      [ ]

const EYE_FRAME_1: Pixel[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 2, y: 1 },
];


// Frame 2
//
// [ ][ ][ ]

const EYE_FRAME_2: Pixel[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
];


// Frame 3
//
// [ ]      [ ]
//
//    [ ]

const EYE_FRAME_3: Pixel[] = [
  { x: 0, y: 0 },
  { x: 2, y: 0 },
  { x: 1, y: 1 },
];


const EYE_FRAMES = [
  EYE_FRAME_1,
  EYE_FRAME_2,
  EYE_FRAME_3,
];




// ==========================
// MOUTH SPRITES
// ==========================


// Frame 1
//
// [ ]              [ ]
//
//    [ ][ ][ ][ ][ ]

const MOUTH_FRAME_1: Pixel[] = [

  { x: 0, y: 0 },
  { x: 8, y: 0 },

  { x: 2, y: 1 },
  { x: 3, y: 1 },
  { x: 4, y: 1 },
  { x: 5, y: 1 },
  { x: 6, y: 1 },

];


// Frame 2
//
// [ ][ ][ ][ ][ ][ ][ ]

const MOUTH_FRAME_2: Pixel[] = [

  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 2, y: 0 },
  { x: 3, y: 0 },
  { x: 4, y: 0 },
  { x: 5, y: 0 },
  { x: 6, y: 0 },

];


const MOUTH_FRAMES = [
  MOUTH_FRAME_1,
  MOUTH_FRAME_2,
];





export function PixelFace({
  size = 56,
  speaking = false,
}: PixelFaceProps) {


  const canvasRef =
    useRef<HTMLCanvasElement>(null);


  const animationRef =
    useRef<number>(0);



  const state =
    useRef({

      eyeFrame: 0,

      eyeTimer: 0,


      mouthFrame: 0,

      mouthTimer: 0,

    });




  useEffect(() => {


    const canvas =
      canvasRef.current;


    if (!canvas)
      return;


    const ctx =
      canvas.getContext("2d");


    if (!ctx)
      return;



    const dpr =
      Math.min(
        window.devicePixelRatio || 1,
        2
      );



    canvas.width =
      size * dpr;


    canvas.height =
      size * dpr;



    ctx.scale(
      dpr,
      dpr
    );




    function drawPixels(
      pixels: Pixel[],
      startX: number,
      startY: number,
      mirror = false
    ) {


      pixels.forEach(pixel => {


        let px =
          pixel.x;


        // mirror inside 3 pixel eye width

        if (mirror) {

          px =
            2 - pixel.x;

        }



        ctx!.fillStyle =
          PIXEL_COLOR;



        ctx!.fillRect(

          startX +
          px * PIXEL_SIZE,


          startY +
          pixel.y * PIXEL_SIZE,


          PIXEL_SIZE,


          PIXEL_SIZE

        );


      });


    }





    function draw() {


      ctx!.clearRect(
        0,
        0,
        size,
        size
      );



      const s =
        state.current;



      // =====================
      // Eye animation
      // =====================


      s.eyeTimer += 16;



      if (s.eyeTimer > 450) {


        s.eyeFrame =
          (
            s.eyeFrame + 1
          )
          %
          EYE_FRAMES.length;


        s.eyeTimer = 0;

      }



      const eye =
        EYE_FRAMES[
          s.eyeFrame
        ]!;



      const eyeY =
        size / 2 - 14;



      const leftEyeX =
        size / 2 - 20;


      const rightEyeX =
        size / 2 + 10;



      // Left eye

      drawPixels(
        eye,
        leftEyeX,
        eyeY,
        false
      );



      // Right eye mirrored

      drawPixels(
        eye,
        rightEyeX,
        eyeY,
        true
      );





      // =====================
      // Mouth animation
      // =====================


      if (speaking) {


        s.mouthTimer += 16;


        if (s.mouthTimer > 300) {


          s.mouthFrame =
            (
              s.mouthFrame + 1
            )
            %
            MOUTH_FRAMES.length;


          s.mouthTimer = 0;

        }


      }
      else {


        s.mouthFrame = 0;

      }



      const mouth =
        MOUTH_FRAMES[
          s.mouthFrame
        ]!;



      const mouthX =
        size / 2 - 20;


      const mouthY =
        size / 2 + 12;



      drawPixels(
        mouth,
        mouthX,
        mouthY,
        false
      );





      animationRef.current =
        requestAnimationFrame(draw);


    }



    draw();



    return () => {

      cancelAnimationFrame(
        animationRef.current
      );

    };


  }, [
    size,
    speaking
  ]);





  return (

    <canvas

      ref={canvasRef}

      style={{

        width: size,

        height: size,

        display: "block",

        imageRendering:
          "pixelated",

      }}

    />

  );

}