import { useRef, useState } from "react";
import "./fileupload.css";

export function FileUpload({ onUpload, accept }) {
    const [file, setFile] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef(null);

    const handleDragOver = (e) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFile = e.dataTransfer.files?.[0];
        if (droppedFile) setFile(droppedFile);
    };

    const handleSelectFile = (e) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) setFile(selectedFile);
    };

    const handleZoneClick = () => {
        inputRef.current.click();
    };

    const handleUploadClick = () => {
        if (file && onUpload) onUpload(file);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
    };

    return (
        <div className="fileupload-container">
            <div
                className={`fileupload-dropzone ${isDragging ? "dragging" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={handleZoneClick}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept={accept}
                    className="fileupload-input"
                    onChange={handleSelectFile}
                />
                {file ? (
                    <p className="fileupload-filename">{file.name}</p>
                ) : (
                    <p className="fileupload-placeholder">
                        Arrastra un archivo aquí o haz clic para seleccionarlo
                    </p>
                )}
            </div>

            <button
                className="fileupload-btn"
                disabled={!file}
                onClick={handleUploadClick}
            >
                Cargar archivo
            </button>
        </div>
    );
}
