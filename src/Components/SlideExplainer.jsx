import { useState } from "react";
import { motion } from "framer-motion";
import { useSwipeable } from "react-swipeable";

const slides = [
  {
    image: "/Slide (1).png", },
  {
    image: "/Slide (2).png", },
  {
    image: "/Slide (3).png", },
  {
    image: "/Slide (4).png", }
];

export default function SlideExplainer({ onComplete }) {
  const [current, setCurrent] = useState(0);

  const nextSlide = () => {
    if (current < slides.length - 1) {
      setCurrent((prev) => prev + 1);
    } else {
      onComplete();
    }
  };

  const prevSlide = () => {
    setCurrent((prev) => (prev - 1 >= 0 ? prev - 1 : prev));
  };

  const handlers = useSwipeable({
    onSwipedLeft: nextSlide,
    onSwipedRight: prevSlide,
  });

  return (
    <div className="flex flex-col items-center justify-center p-4 h-screen relative" {...handlers}>
      <div className="border rounded-lg shadow-md p-4 w-full max-w-md flex flex-col items-center relative">
        <motion.img
          key={slides[current].image}
          src={slides[current].image}
          alt={slides[current].title}
          className="w-full h-auto rounded-lg"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.5 }}
        />
        <h2 className="text-xl font-bold mt-4 text-center">{slides[current].title}</h2>
        <p className="text-sm text-gray-600 text-center mt-2">
          {slides[current].description}
        </p>
      </div>
      <div className="flex mt-4 space-x-4 fixed bottom-8 bg-white p-2 rounded-lg shadow-md w-auto z-50 border border-gray-300">
        <button
          className="px-4 py-2 bg-gray-300 text-gray-800 font-semibold rounded disabled:opacity-50 hover:bg-gray-400 focus:ring-2 focus:ring-gray-500"
          onClick={prevSlide}
          disabled={current === 0}
        >
          Anterior
        </button>
        <button
          className="px-4 py-2 bg-blue-500 text-white font-semibold rounded disabled:opacity-50 hover:bg-blue-600 focus:ring-2 focus:ring-blue-700"
          onClick={nextSlide}
        >
          {current === slides.length - 1 ? "Finalizar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}
