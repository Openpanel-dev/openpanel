import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { op } from '../analytics';
import type { Product } from '../types';

type Props = {
  products: Product[];
  onAddToCart: (product: Product) => void;
};

export function ProductPage({ products, onAddToCart }: Props) {
  const { id } = useParams<{ id: string }>();
  const product = products.find((p) => p.id === id);

  useEffect(() => {
    if (product) {
      op.track('product_viewed', {
        product_id: product.id,
        product_name: product.name,
        price: product.price,
        category: product.category,
      });
    }
  }, [product]);

  if (!product) {
    return (
      <div>
        <div className="page-title">Product not found</div>
        <Link to="/"><button type="button">← Back to shop</button></Link>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Link to="/">← Back to shop</Link>
      </div>
      <div className="product-detail">
        <div className="product-detail-img">[img]</div>
        <div className="product-detail-info">
          <div className="product-card-category">{product.category}</div>
          <div className="product-detail-name">{product.name}</div>
          <div className="product-detail-price">${product.price}</div>
          <p className="product-detail-desc">
            A high quality {product.name.toLowerCase()} for testing purposes.
            Lorem ipsum dolor sit amet consectetur adipiscing elit.
          </p>
          <button
            type="button"
            className="primary"
            onClick={() => onAddToCart(product)}
          >
            Add to cart
          </button>
        </div>
      </div>
    </div>
  );
}
