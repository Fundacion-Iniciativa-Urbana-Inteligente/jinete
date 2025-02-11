//Pie de la página
export default function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="d-flex flex-wrap justify-content-between align-items-center py-3">
          <div className="col-md-4 d-flex align-items-center">
            <span className="text-muted">© 2024 Jinete.ar - Movilidad Sustentable</span>
          </div>
          <ul className="nav col-md-4 justify-content-end list-unstyled d-flex">
            <li className="ms-3">
              <a className="text-muted" href="#" aria-label="Facebook">
                <i className="bi bi-facebook"></i>
              </a>
            </li>
            <li className="ms-3">
              <a className="text-muted" href="#" aria-label="Instagram">
                <i className="bi bi-instagram"></i>
              </a>
            </li>
            <li className="ms-3">
              <a className="text-muted" href="#" aria-label="Twitter">
                <i className="bi bi-twitter-x"></i>
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}