export function CatPet() {
  return (
    <div className="cat-pet" aria-hidden="true">
      <div className="cat-pet-shadow" />
      <div className="cat-pet-body">
        <div className="cat-pet-ear cat-pet-ear-left" />
        <div className="cat-pet-ear cat-pet-ear-right" />
        <div className="cat-pet-face">
          <span className="cat-pet-eye cat-pet-eye-left" />
          <span className="cat-pet-eye cat-pet-eye-right" />
          <span className="cat-pet-nose" />
          <span className="cat-pet-mouth" />
          <span className="cat-pet-cheek cat-pet-cheek-left" />
          <span className="cat-pet-cheek cat-pet-cheek-right" />
        </div>
        <div className="cat-pet-tail" />
      </div>
    </div>
  );
}