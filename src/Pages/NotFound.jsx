import { NavLink } from "react-router-dom";
export default function NotFound(){
    return(
        <>
        <div className="container">
            <h1>Not Found</h1>
            <p>Parece que te perdiste</p>
            <button>
            <NavLink to="/">Volver al mapa</NavLink>
            </button>
        </div>
        </>
    )
}